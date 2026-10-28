"""Worker IMAP independiente: lee notificaciones de Binance Pay en Gmail y registra evidencia.

Ejecutar:  python -m app.workers.imap_reconciliation [--once]
Garantías: BODY.PEEK[] (no marca leído al leer), persistencia antes de marcar \\Seen, dedupe por
UIDVALIDITY+UID y hash, cuarentena de lo no confiable, exclusión mutua por advisory lock, backoff exponencial.
Nunca aprueba pagos ni crea suscripciones.
"""
from __future__ import annotations

import argparse
import hashlib
import imaplib
import signal
import ssl
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_engine, session_scope
from app.core.locks import LOCK_IMAP, advisory_lock
from app.core.logging import get_logger
from app.models.payment_evidence import ImapMailboxState, PaymentEvidence
from app.security.email_authentication import (
    AUTH_NONE,
    AUTH_PASS,
    evaluate_authentication,
    forwarded_origin,
    sender_address,
    strip_quote_prefix,
)
from app.services.binance_parser import ParsedPayment, extract_text, parse_payment_text
from app.services.notification_service import enqueue
from app.services.payment_matching import reconcile_evidence, reconcile_unmatched

log = get_logger("JW-IMAP")

MAX_RAW_BYTES = 5 * 1024 * 1024
SOCKET_TIMEOUT_SECONDS = 60
BACKOFF_BASE_SECONDS = 30
BACKOFF_MAX_SECONDS = 900
UNKNOWN_SENDER = "unknown@invalid"


# --- Conexión ----------------------------------------------------------------------------------------------------

def get_google_access_token(settings: Settings) -> str:
    credentials = Credentials(
        token=None,
        refresh_token=settings.google_refresh_token.get_secret_value(),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id.get_secret_value(),
        client_secret=settings.google_client_secret.get_secret_value(),
        scopes=["https://mail.google.com/"],
    )
    credentials.refresh(Request())
    if not credentials.valid or not credentials.token:
        raise RuntimeError("Unable to obtain valid Gmail access token.")
    return credentials.token


def connect_imap(settings: Settings) -> imaplib.IMAP4_SSL:
    """IMAP sobre TLS verificado + SASL XOAUTH2. El token solo vive en memoria y no se registra."""
    context = ssl.create_default_context()
    conn = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port, ssl_context=context, timeout=SOCKET_TIMEOUT_SECONDS)
    token = get_google_access_token(settings)
    auth = f"user={settings.imap_username}\x01auth=Bearer {token}\x01\x01".encode()
    conn.authenticate("XOAUTH2", lambda _challenge: auth)
    return conn


# --- Análisis de mensajes (sin BD) -------------------------------------------------------------------------------

@dataclass
class AnalyzedMessage:
    sender: str
    message_id: str | None
    sha256: str
    auth_status: str
    parse_status: str
    received_at: datetime
    parsed: ParsedPayment | None
    notes: str | None
    sender_allowlisted: bool
    alert: bool  # remitente conocido con autenticación fallida: posible suplantación


def _received_at(msg, now: datetime) -> datetime:
    try:
        moment = parsedate_to_datetime(str(msg.get("Date", "")))
    except (TypeError, ValueError):
        return now
    return moment.astimezone(timezone.utc) if moment.tzinfo else now


def analyze_message(raw: bytes, settings: Settings, now: datetime | None = None) -> AnalyzedMessage:
    now = now or datetime.now(timezone.utc)
    sha = hashlib.sha256(raw).hexdigest()

    if len(raw) > MAX_RAW_BYTES:
        return AnalyzedMessage(UNKNOWN_SENDER, None, sha, AUTH_NONE, "QUARANTINED", now, None, "oversized_message", False, False)

    try:
        msg = BytesParser(policy=policy.default).parsebytes(raw)
        sender = sender_address(msg) or UNKNOWN_SENDER
        message_id = str(msg.get("Message-ID", "") or "")[:500] or None
        received_at = _received_at(msg, now)
    except Exception:  # noqa: BLE001 - un correo malformado se registra, no se descarta
        return AnalyzedMessage(UNKNOWN_SENDER, None, sha, AUTH_NONE, "QUARANTINED", now, None, "malformed_message", False, False)

    is_direct = sender in settings.sender_allowlist
    is_forwarder = not is_direct and sender in settings.forwarder_allowlist
    if not is_direct and not is_forwarder:
        return AnalyzedMessage(sender[:254], message_id, sha, AUTH_NONE, "QUARANTINED", received_at, None, "sender_not_allowlisted", False, False)

    # Directo: se autentica el From de Binance. Reenviado: se autentica el reenviador (su From) en nuestro servidor receptor.
    auth = evaluate_authentication(msg, settings.trusted_authserv_id)
    if auth.status != AUTH_PASS:
        return AnalyzedMessage(
            sender[:254], message_id, sha, auth.status, "QUARANTINED", received_at, None, f"auth_{auth.status.lower()}: {auth.detail}", True, True
        )

    text = extract_text(msg)
    forward_note = None
    if is_forwarder:
        origin = forwarded_origin(msg, text)
        if origin.sender not in settings.sender_allowlist:
            # Reenviador autenticado pero el original no es de Binance (u opaco): se registra sin alerta.
            return AnalyzedMessage(
                sender[:254], message_id, sha, auth.status, "QUARANTINED", received_at, None,
                f"forwarded_origin_not_allowlisted: {origin.sender or 'unknown'}"[:300], True, False,
            )
        if origin.inner is not None:
            # Reenvío como adjunto: conserva las cabeceras originales, incluido el Authentication-Results de nuestro servidor.
            inner_auth = evaluate_authentication(origin.inner, settings.trusted_authserv_id)
            if inner_auth.status != AUTH_PASS:
                return AnalyzedMessage(
                    sender[:254], message_id, sha, inner_auth.status, "QUARANTINED", received_at, None,
                    f"forwarded_auth_{inner_auth.status.lower()}: {inner_auth.detail}", True, True,
                )
            forward_note = f"forwarded_attached_via={sender}"
        else:
            forward_note = f"forwarded_inline_via={sender}"
        text = strip_quote_prefix(text)

    parsed = parse_payment_text(text)
    notes = ",".join([*parsed.problems, *([forward_note] if forward_note else [])]) or None
    return AnalyzedMessage(sender[:254], message_id, sha, auth.status, parsed.status, received_at, parsed, notes, True, False)


# --- Persistencia ------------------------------------------------------------------------------------------------

def store_evidence(
    session: Session, *, raw: bytes, mailbox: str, uidvalidity: int, uid: int, settings: Settings
) -> tuple[PaymentEvidence | None, AnalyzedMessage]:
    """Inserta la evidencia (o None si el mensaje ya estaba registrado). Dentro de la transacción del llamador."""
    analysis = analyze_message(raw, settings)

    seen = session.execute(
        select(PaymentEvidence.id).where(
            PaymentEvidence.mailbox == mailbox,
            (
                (PaymentEvidence.mailbox_uidvalidity == uidvalidity) & (PaymentEvidence.mailbox_uid == uid)
                | (PaymentEvidence.raw_message_sha256 == analysis.sha256)
            ),
        )
    ).first()
    if seen:
        return None, analysis

    parsed = analysis.parsed
    transaction_id = parsed.transaction_id if parsed else None
    parse_status, notes = analysis.parse_status, analysis.notes

    if transaction_id:
        reused = session.execute(
            select(PaymentEvidence.id).where(
                PaymentEvidence.provider == "BINANCE_PAY", PaymentEvidence.transaction_id == transaction_id
            )
        ).first()
        if reused:  # mismo ID de transacción en otro mensaje: reenvío o intento de reutilización
            parse_status, notes = "QUARANTINED", f"duplicate_transaction_id: {transaction_id}"
            transaction_id = None
            enqueue(
                session,
                "payment_evidence_alert",
                {"subject": "ID de transacción reutilizado", "transaction_id": parsed.transaction_id, "sha256": analysis.sha256},
                idempotency_key=f"dup-tx:{analysis.sha256}",
            )

    evidence = PaymentEvidence(
        mailbox=mailbox,
        mailbox_uidvalidity=uidvalidity,
        mailbox_uid=uid,
        message_id=analysis.message_id,
        raw_message_sha256=analysis.sha256,
        sender_address=analysis.sender,
        sender_auth_status=analysis.auth_status,
        transaction_id=transaction_id,
        amount=parsed.amount if parsed and parse_status != "QUARANTINED" else None,
        asset=parsed.asset if parsed and parse_status != "QUARANTINED" else None,
        recipient_id=parsed.recipient_id if parsed and parse_status != "QUARANTINED" else None,
        transferred_at=parsed.transferred_at if parsed and parse_status != "QUARANTINED" else None,
        received_at=analysis.received_at,
        parse_status=parse_status,
        notes=notes,
    )
    session.add(evidence)
    session.flush()

    if analysis.alert:
        enqueue(
            session,
            "imap_alert",
            {"subject": "Correo de remitente Binance con autenticación fallida", "sender": analysis.sender, "detail": notes, "sha256": analysis.sha256},
            idempotency_key=f"auth-fail:{analysis.sha256}",
        )
    return evidence, analysis


def _save_cursor(session: Session, mailbox: str, folder: str, uidvalidity: int, uid: int) -> None:
    session.execute(
        text(
            """
            INSERT INTO imap_mailbox_state (mailbox, folder, uidvalidity, last_uid, updated_at)
            VALUES (:m, :f, :v, :u, now())
            ON CONFLICT (mailbox, folder) DO UPDATE
               SET uidvalidity = EXCLUDED.uidvalidity, last_uid = EXCLUDED.last_uid, updated_at = now()
            """
        ),
        {"m": mailbox, "f": folder, "v": uidvalidity, "u": uid},
    )


def _load_cursor(mailbox: str, folder: str, uidvalidity: int) -> int:
    with session_scope() as session:
        state = session.get(ImapMailboxState, (mailbox, folder))
    if state is None:
        return 0
    if state.uidvalidity != uidvalidity:
        # Los UID previos ya no valen. Se relee todo; el hash del mensaje impide duplicar evidencia.
        log.warning("UIDVALIDITY changed (%s -> %s); rescanning folder", state.uidvalidity, uidvalidity)
        return 0
    return state.last_uid


# --- Ciclo -------------------------------------------------------------------------------------------------------

def run_cycle(settings: Settings, stop: threading.Event) -> int:
    """Una pasada: conectar, leer UID nuevos (máximo imap_batch_limit), persistir, marcar leído. Devuelve procesados."""
    mailbox, folder = settings.imap_username, settings.imap_mailbox
    conn = connect_imap(settings)
    processed = 0
    try:
        typ, _ = conn.select(folder)  # lectura-escritura: se marca \Seen solo tras persistir
        if typ != "OK":
            raise imaplib.IMAP4.error(f"cannot select {folder}")
        uidvalidity = int(conn.response("UIDVALIDITY")[1][0])
        last_uid = _load_cursor(mailbox, folder, uidvalidity)

        typ, data = conn.uid("SEARCH", "UID", f"{last_uid + 1}:*")
        if typ != "OK":
            raise imaplib.IMAP4.error("UID SEARCH failed")
        uids = sorted(u for u in (int(x) for x in (data[0] or b"").split()) if u > last_uid)[: settings.imap_batch_limit]
        if uids:
            log.info("%d new message(s) detected.", len(uids))

        for uid in uids:
            if stop.is_set():
                break
            typ, parts = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")
            raw = next((p[1] for p in parts or [] if isinstance(p, tuple)), None)
            if typ != "OK" or raw is None:
                raise imaplib.IMAP4.error(f"fetch failed for UID {uid}")

            with session_scope() as session:  # evidencia + cursor en la misma transacción
                evidence, analysis = store_evidence(
                    session, raw=raw, mailbox=mailbox, uidvalidity=uidvalidity, uid=uid, settings=settings
                )
                _save_cursor(session, mailbox, folder, uidvalidity, uid)
            processed += 1

            if evidence is not None:
                try:
                    with session_scope() as session:
                        reconcile_evidence(session, evidence.id, settings)
                except Exception:  # noqa: BLE001 - la evidencia ya está a salvo; se reintenta en reconcile_unmatched
                    log.exception("reconcile failed for evidence %s", evidence.id)
            if analysis.sender_allowlisted:
                conn.uid("STORE", str(uid), "+FLAGS", "(\\Seen)")  # solo correos de Binance; el resto se deja intacto
    finally:
        try:
            conn.logout()
        except (imaplib.IMAP4.error, OSError):
            pass

    with session_scope() as session:
        reconcile_unmatched(session, settings)
    return processed


def run_forever(settings: Settings, stop: threading.Event) -> int:
    backoff = BACKOFF_BASE_SECONDS
    while not stop.is_set():
        try:
            run_cycle(settings, stop)
            backoff = BACKOFF_BASE_SECONDS
            stop.wait(settings.imap_poll_seconds)
        except (imaplib.IMAP4.abort, imaplib.IMAP4.error, ssl.SSLError, OSError) as exc:
            log.warning("IMAP error (%s); retry in %ss", type(exc).__name__, backoff)
            stop.wait(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX_SECONDS)
        except Exception:  # noqa: BLE001 - incluye fallo de renovación OAuth; nunca tumbar el bucle
            log.exception("cycle failed; retry in %ss", backoff)
            stop.wait(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX_SECONDS)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="JW Solutions IMAP reconciliation worker")
    parser.add_argument("--once", action="store_true", help="ejecuta un solo ciclo y termina")
    args = parser.parse_args()

    settings = get_settings()
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())  # termina tras completar la transacción en curso

    with advisory_lock(get_engine(), LOCK_IMAP) as acquired:
        if not acquired:
            log.warning("another IMAP worker holds the lock; exiting")
            return 1
        log.info("worker started")
        if args.once:
            run_cycle(settings, stop)
            return 0
        return run_forever(settings, stop)


if __name__ == "__main__":
    raise SystemExit(main())
