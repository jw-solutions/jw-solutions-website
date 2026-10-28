"""Inspección SOLO LECTURA del buzón para construir la allowlist y las fixtures del parser.

Uso (lo ejecuta [J], con el .env real):  python -m scripts.inspect_mailbox --search binance --limit 20 --out tests/fixtures/emails
- Selecciona la carpeta en readonly y usa BODY.PEEK[]: no marca, mueve ni borra nada.
- Imprime por mensaje: remitente exacto, authserv-id y veredictos SPF/DKIM/DMARC, asunto y la FORMA de cada línea
  "Etiqueta: valor" con el valor enmascarado (dígitos -> 9, letras -> x; símbolos de activo y prefijos se conservan).
- Con --out guarda una fixture .eml por mensaje con cuerpo ENMASCARADO (cabeceras de autenticación intactas,
  Message-ID y destinatarios sustituidos). Revisa a mano cada archivo antes de versionarlo.
No envía nada a ningún servicio externo.
"""
from __future__ import annotations

import argparse
import re
from collections import Counter
from email import policy
from email.parser import BytesParser
from pathlib import Path

from app.core.config import get_settings
from app.security.email_authentication import evaluate_authentication, sender_address
from app.services.binance_parser import ASSETS, extract_text
from app.workers.imap_reconciliation import connect_imap

_KEEP = re.compile(r"\b(" + "|".join(ASSETS) + r")\b")
_LINE = re.compile(r"^\s*([^:：\n]{2,40})\s*([:：])\s*(.+?)\s*$")


def mask(value: str) -> str:
    kept: list[str] = []
    last = 0
    for m in _KEEP.finditer(value):
        kept.append(re.sub(r"[A-Za-z]", "x", re.sub(r"\d", "9", value[last : m.start()])))
        kept.append(m.group(0))
        last = m.end()
    kept.append(re.sub(r"[A-Za-z]", "x", re.sub(r"\d", "9", value[last:])))
    return "".join(kept)


def masked_body(text: str) -> str:
    out = []
    for line in text.splitlines():
        m = _LINE.match(line)
        out.append(f"{m.group(1)}{m.group(2)} {mask(m.group(3))}" if m else mask(line))
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--search", default="binance", help="texto buscado en FROM/SUBJECT (solo para listar candidatos)")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    settings = get_settings()
    conn = connect_imap(settings)
    senders: Counter[str] = Counter()
    try:
        conn.select(settings.imap_mailbox, readonly=True)
        _, data = conn.uid("SEARCH", "OR", "FROM", f'"{args.search}"', "SUBJECT", f'"{args.search}"')
        uids = [int(x) for x in (data[0] or b"").split()][-args.limit :]
        for uid in uids:
            _, parts = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")
            raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
            if raw is None:
                continue
            msg = BytesParser(policy=policy.default).parsebytes(raw)
            sender = sender_address(msg)
            senders[sender] += 1
            auth = evaluate_authentication(msg, settings.trusted_authserv_id)
            ids = sorted({str(h).split(";", 1)[0].strip() for h in msg.get_all("Authentication-Results", [])})
            print(f"\n== UID {uid} | from={sender} | auth={auth.status} ({auth.detail}) | authserv-ids={ids}")
            print(f"   subject shape: {mask(str(msg.get('Subject', '')))}")
            body = masked_body(extract_text(msg))
            for line in body.splitlines():
                if _LINE.match(line):
                    print(f"   {line}")
            if args.out:
                args.out.mkdir(parents=True, exist_ok=True)
                head = [f"From: {sender}", "To: mailbox@example.test", "Subject: " + mask(str(msg.get("Subject", "")))]
                head += [f"Authentication-Results: {' '.join(str(h).split())}" for h in msg.get_all("Authentication-Results", [])]
                head += ["Message-ID: <fixture@example.test>", "Content-Type: text/plain; charset=utf-8"]
                (args.out / f"uid_{uid}.eml").write_text("\r\n".join(head) + "\r\n\r\n" + body, encoding="utf-8")
    finally:
        conn.logout()

    print("\nRemitentes distintos (candidatos para BINANCE_NOTIFICATION_SENDERS; verifícalos tú, no los copies a ciegas):")
    for address, n in senders.most_common():
        print(f"  {n:3d}  {address}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
