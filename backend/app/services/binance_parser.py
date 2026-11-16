"""Extracción de datos de pago desde el texto de notificaciones de Binance Pay.

ADVERTENCIA: los patrones son un adaptador inicial (anexo §3.6), NO el formato verificado de Binance.
Deben ajustarse con correos reales anonimizados antes de confiar en ellos. Dinero siempre en Decimal.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.message import Message

ASSETS = ("USDT", "USDC", "BNB", "BTC", "ETH")
MAX_BODY_CHARS = 200_000

_AMOUNT_LABEL = re.compile(r"(?im)^\s*(?:Amount|Monto|Total)\s*[:：]\s*(?P<raw>.+?)\s*$")
_AMOUNT_VALUE = re.compile(
    r"^(?P<amount>\d{1,3}(?:,\d{3})*(?:\.\d{1,8})?|\d+(?:\.\d{1,8})?)\s*(?P<asset>" + "|".join(ASSETS) + r")$"
)
_TRANSACTION = re.compile(
    r"(?im)^\s*(?:Transaction ID|Payment ID|ID de transacci[oó]n)\s*[:：]\s*(?P<tx>(?:0x[A-Fa-f0-9]{64}|[A-Za-z0-9_-]{8,128}))\s*$"
)
_DATE_LABEL = re.compile(r"(?im)^\s*(?:Transaction Time|Payment Time|Fecha de transacci[oó]n)\s*[:：]\s*(?P<raw>.+?)\s*$")
_DATE_AWARE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
_RECIPIENT = re.compile(r"(?im)^\s*(?:Receiver|Recipient|Destinatario)(?:\s+(?:ID|UID))?\s*[:：]\s*(?P<id>\d{4,20})\s*$")
_JW_ORDER_CODE = re.compile(r"\b(JW-[A-Z0-9]{9})\b")

_PAYPAL_TX = re.compile(
    r"(?im)(?:Transaction\s*ID|ID\s*de\s*transacci[oó]n|Receipt\s*No\.?)\s*[:：#]?\s*(?P<tx>[A-Z0-9]{10,30})\b"
)
_PAYPAL_AMOUNT = re.compile(
    r"(?im)(?:Amount|Total|You\s+received|Ha\s+recibido|Importe)\s*[:：]?\s*\$?\s*(?P<amount>\d{1,6}(?:[.,]\d{2})?)\s*(?:USD|\$)?\b"
)


@dataclass
class ParsedPayment:
    transaction_id: str | None = None
    amount: Decimal | None = None
    asset: str | None = None
    transferred_at: datetime | None = None
    recipient_id: str | None = None
    status: str = "PARTIAL"  # PARSED | PARTIAL | INVALID
    problems: list[str] = field(default_factory=list)
    provider: str = "BINANCE_PAY"
    reference_code: str | None = None


def extract_text(msg: Message) -> str:
    """Texto plano del mensaje (text/plain preferido; HTML sin etiquetas como respaldo)."""
    plain: list[str] = []
    markup: list[str] = []
    for part in msg.walk():
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            content = part.get_content()
        except (LookupError, UnicodeDecodeError):
            continue
        if not isinstance(content, str):
            continue
        if ctype == "text/plain":
            plain.append(content)
        else:
            stripped = re.sub(r"(?is)<(script|style).*?</\1>", " ", content)
            stripped = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li)>", "\n", stripped)
            markup.append(html.unescape(re.sub(r"<[^>]+>", " ", stripped)))
    text = "\n".join(plain) if plain else "\n".join(markup)
    return text[:MAX_BODY_CHARS]


def _parse_amount(raw: str) -> tuple[Decimal, str] | None:
    match = _AMOUNT_VALUE.match(raw.strip())
    if not match:
        return None
    try:
        value = Decimal(match.group("amount").replace(",", ""))
    except InvalidOperation:
        return None
    if value <= 0:
        return None
    return value, match.group("asset").upper()


def parse_payment_text(text: str) -> ParsedPayment:
    result = ParsedPayment()

    amount_line = _AMOUNT_LABEL.search(text)
    if amount_line:
        parsed = _parse_amount(amount_line.group("raw"))
        if parsed is None:
            result.problems.append("invalid_amount")
        else:
            result.amount, result.asset = parsed

    tx = _TRANSACTION.search(text)
    if tx:
        result.transaction_id = tx.group("tx")

    date_line = _DATE_LABEL.search(text)
    if date_line:
        raw = date_line.group("raw")
        if _DATE_AWARE.match(raw):
            try:
                moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                result.transferred_at = moment.astimezone(timezone.utc)
            except ValueError:
                result.problems.append("invalid_date")
        else:
            result.problems.append("date_without_timezone")  # nunca apto para aprobación automática

    recipient = _RECIPIENT.search(text)
    if recipient:
        result.recipient_id = recipient.group("id")

    code_match = _JW_ORDER_CODE.search(text)
    if code_match:
        result.reference_code = code_match.group(1)

    if "invalid_amount" in result.problems or "invalid_date" in result.problems:
        result.status = "INVALID"
    elif result.transaction_id and result.amount is not None and result.asset and result.transferred_at:
        result.status = "PARSED"
    else:
        result.status = "PARTIAL"
    return result


def parse_paypal_text(text: str, received_at: datetime | None = None) -> ParsedPayment:
    """Extrae TxID, monto USD y código JW-XXXXXXXXX de recibos oficiales de PayPal."""
    result = ParsedPayment(provider="PAYPAL", asset="USD", transferred_at=received_at)

    tx = _PAYPAL_TX.search(text)
    if tx:
        result.transaction_id = tx.group("tx").strip()

    amt = _PAYPAL_AMOUNT.search(text)
    if amt:
        raw_amt = amt.group("amount").replace(",", ".")
        try:
            value = Decimal(raw_amt)
            if value > 0:
                result.amount = value
            else:
                result.problems.append("invalid_amount")
        except InvalidOperation:
            result.problems.append("invalid_amount")

    code_match = _JW_ORDER_CODE.search(text)
    if code_match:
        result.reference_code = code_match.group(1)

    if "invalid_amount" in result.problems:
        result.status = "INVALID"
    elif result.transaction_id and result.amount is not None and result.reference_code:
        result.status = "PARSED"
    else:
        result.status = "PARTIAL"
    return result
