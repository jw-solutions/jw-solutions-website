from __future__ import annotations

import re
from dataclasses import dataclass
from email.message import Message
from email.utils import parseaddr

AUTH_PASS = "PASS"
AUTH_FAIL = "FAIL"
AUTH_NONE = "NONE"  # sin Authentication-Results de un servidor de confianza

_RESULT = re.compile(r"\b(spf|dkim|dmarc)\s*=\s*([a-z]+)", re.IGNORECASE)
_HEADER_FROM = re.compile(r"header\.from\s*=\s*([A-Za-z0-9.-]+)", re.IGNORECASE)


@dataclass(frozen=True)
class AuthResult:
    status: str
    detail: str


def sender_address(msg: Message) -> str:
    """Dirección exacta del From, en minúsculas ('' si no se puede extraer)."""
    return parseaddr(str(msg.get("From", "")))[1].strip().lower()


_FORWARD_MARKER = re.compile(
    r"(?im)^[>\s]*-{2,}\s*(?:Forwarded message|Mensaje reenviado|Original message)\s*-{2,}\s*$"
)
_FORWARD_FROM = re.compile(r"(?im)^[>\s]*(?:From|De)\s*:\s*(?P<raw>.+?)\s*$")
_FORWARD_WINDOW_LINES = 8


@dataclass(frozen=True)
class ForwardedOrigin:
    sender: str  # dirección del From original ('' si no se encontró)
    inner: Message | None  # mensaje original adjunto (message/rfc822) si el reenvío es "como adjunto"


def forwarded_origin(msg: Message, body_text: str) -> ForwardedOrigin:
    """Remitente original de un reenvío: adjunto message/rfc822 o bloque '---- Forwarded message ----' en línea.

    El valor es una afirmación del reenviador: solo es confiable si el reenviador ya se autenticó.
    """
    for part in msg.walk():
        if part.get_content_type() != "message/rfc822":
            continue
        try:
            inner = part.get_content()
        except (LookupError, UnicodeDecodeError, ValueError):
            continue
        if isinstance(inner, Message):
            return ForwardedOrigin(sender_address(inner), inner)

    marker = _FORWARD_MARKER.search(body_text)
    if marker:
        window = "\n".join(body_text[marker.end():].splitlines()[:_FORWARD_WINDOW_LINES])
        found = _FORWARD_FROM.search(window)
        if found:
            return ForwardedOrigin(parseaddr(found.group("raw"))[1].strip().lower(), None)
    return ForwardedOrigin("", None)


def strip_quote_prefix(text: str) -> str:
    """Quita el '> ' con que algunos clientes citan el cuerpo reenviado, para que los patrones de línea apliquen."""
    return "\n".join(re.sub(r"^[>\s]+", "", line) for line in text.splitlines())


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def _trusted_header(msg: Message, trusted_authserv_id: str) -> str | None:
    """Primer (más reciente) Authentication-Results cuyo authserv-id es el del servidor receptor de confianza.

    Los que añada el remitente llevan otro authserv-id (o aparecen debajo) y se ignoran.
    """
    trusted = trusted_authserv_id.strip().lower()
    for raw in msg.get_all("Authentication-Results", []):
        value = " ".join(str(raw).split())
        authserv_id = value.split(";", 1)[0].strip().lower()
        if authserv_id == trusted:
            return value
    return None


def evaluate_authentication(msg: Message, trusted_authserv_id: str) -> AuthResult:
    """PASS solo si DMARC pasa, SPF o DKIM pasan y el dominio autenticado está alineado con el From.

    Es protección de identidad del correo, no prueba de pago.
    """
    header = _trusted_header(msg, trusted_authserv_id)
    if header is None:
        return AuthResult(AUTH_NONE, "no trusted Authentication-Results")

    results: dict[str, str] = {}
    for method, verdict in _RESULT.findall(header):
        results.setdefault(method.lower(), verdict.lower())

    from_domain = _domain(sender_address(msg))
    aligned_domains = {d.lower() for d in _HEADER_FROM.findall(header)}
    detail = f"spf={results.get('spf', '-')} dkim={results.get('dkim', '-')} dmarc={results.get('dmarc', '-')}"

    if results.get("dmarc") != "pass":
        return AuthResult(AUTH_FAIL, detail)
    if "pass" not in (results.get("spf"), results.get("dkim")):
        return AuthResult(AUTH_FAIL, detail)
    if not from_domain or (aligned_domains and from_domain not in aligned_domains):
        return AuthResult(AUTH_FAIL, f"{detail} misaligned")
    return AuthResult(AUTH_PASS, detail)
