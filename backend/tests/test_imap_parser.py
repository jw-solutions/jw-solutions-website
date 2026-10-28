from datetime import datetime, timezone
from decimal import Decimal
from email.message import EmailMessage

from app.core.config import get_settings
from app.services.binance_parser import parse_payment_text
from app.workers.imap_reconciliation import analyze_message

GOOD_BODY = """Payment received
Amount: 1,012.50 USDT
Transaction ID: TX123456789
Transaction Time: 2026-10-27T14:30:00Z
Receiver ID: 188552430
"""


def _mail(body: str, sender: str = "notify@binance.test", auth: str | None = None) -> bytes:
    headers = [f"From: Binance <{sender}>", "To: mailbox@example.test", "Subject: Payment", "Message-ID: <abc@binance.test>"]
    if auth:
        headers.append(f"Authentication-Results: mx.google.com; {auth}")
    return ("\r\n".join(headers) + "\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + body).encode()


PASS_AUTH = "spf=pass smtp.mailfrom=binance.test; dkim=pass header.d=binance.test; dmarc=pass header.from=binance.test"


def test_parses_all_fields_with_decimal():
    parsed = parse_payment_text(GOOD_BODY)
    assert parsed.status == "PARSED"
    assert parsed.amount == Decimal("1012.50")
    assert parsed.asset == "USDT"
    assert parsed.transaction_id == "TX123456789"
    assert parsed.transferred_at == datetime(2026, 10, 27, 14, 30, tzinfo=timezone.utc)
    assert parsed.recipient_id == "188552430"


def test_invalid_thousands_separator_is_invalid():
    parsed = parse_payment_text(GOOD_BODY.replace("1,012.50", "1,2,3"))
    assert parsed.status == "INVALID"
    assert parsed.amount is None


def test_missing_amount_is_partial():
    parsed = parse_payment_text(GOOD_BODY.replace("Amount: 1,012.50 USDT\n", ""))
    assert parsed.status == "PARTIAL"


def test_missing_transaction_id_is_partial():
    parsed = parse_payment_text(GOOD_BODY.replace("Transaction ID: TX123456789\n", ""))
    assert parsed.status == "PARTIAL"
    assert parsed.transaction_id is None


def test_date_without_timezone_never_parses_as_complete():
    parsed = parse_payment_text(GOOD_BODY.replace("2026-10-27T14:30:00Z", "2026-10-27T14:30:00"))
    assert parsed.transferred_at is None
    assert parsed.status == "PARTIAL"
    assert "date_without_timezone" in parsed.problems


def test_authentic_sender_is_parsed():
    result = analyze_message(_mail(GOOD_BODY, auth=PASS_AUTH), get_settings())
    assert result.parse_status == "PARSED"
    assert result.auth_status == "PASS"
    assert result.sender_allowlisted


def test_unknown_sender_is_quarantined_without_alert():
    result = analyze_message(_mail(GOOD_BODY, sender="x@evil.test", auth=PASS_AUTH), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert not result.alert
    assert result.parsed is None


def test_lookalike_sender_is_not_matched_by_substring():
    result = analyze_message(_mail(GOOD_BODY, sender="binance@evil.test", auth=PASS_AUTH), get_settings())
    assert result.parse_status == "QUARANTINED"


def test_known_sender_without_trusted_auth_is_quarantined_with_alert():
    result = analyze_message(_mail(GOOD_BODY), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert result.alert


def test_auth_header_from_untrusted_server_is_ignored():
    raw = _mail(GOOD_BODY).replace(b"Subject:", b"Authentication-Results: attacker.test; dmarc=pass spf=pass\r\nSubject:")
    result = analyze_message(raw, get_settings())
    assert result.parse_status == "QUARANTINED"


def test_dmarc_fail_is_quarantined():
    result = analyze_message(_mail(GOOD_BODY, auth="spf=pass; dkim=pass; dmarc=fail header.from=binance.test"), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert result.alert


FWD = "fwd@forwarder.test"
FWD_AUTH = "spf=pass smtp.mailfrom=forwarder.test; dkim=pass header.d=forwarder.test; dmarc=pass header.from=forwarder.test"


def _inline_forward(original_sender: str = "notify@binance.test", sender: str = FWD, auth: str | None = FWD_AUTH, quote: str = "") -> bytes:
    body = f"---------- Forwarded message ---------\nFrom: Binance <{original_sender}>\nDate: Tue, 27 Oct 2026\nSubject: Payment\n\n{GOOD_BODY}"
    if quote:
        body = "\n".join(quote + line for line in body.splitlines())
    return _mail(body, sender=sender, auth=auth)


def _attached_forward(inner_auth: str | None, original_sender: str = "notify@binance.test") -> bytes:
    inner = EmailMessage()
    inner["From"] = f"Binance <{original_sender}>"
    inner["To"] = "chirinos@forwarder.test"
    inner["Subject"] = "Payment"
    if inner_auth:
        inner["Authentication-Results"] = f"mx.google.com; {inner_auth}"
    inner.set_content(GOOD_BODY)
    outer = EmailMessage()
    outer["From"] = f"Me <{FWD}>"
    outer["To"] = "mailbox@example.test"
    outer["Subject"] = "Fwd: Payment"
    outer["Message-ID"] = "<fwd@forwarder.test>"
    outer["Authentication-Results"] = f"mx.google.com; {FWD_AUTH}"
    outer.set_content("see attached")
    outer.add_attachment(inner)
    return outer.as_bytes()


def test_inline_forward_from_trusted_forwarder_is_parsed():
    result = analyze_message(_inline_forward(), get_settings())
    assert result.parse_status == "PARSED"
    assert result.parsed.transaction_id == "TX123456789"
    assert result.sender == FWD
    assert result.sender_allowlisted
    assert "forwarded_inline_via" in (result.notes or "")


def test_inline_forward_with_quote_prefix_is_parsed():
    result = analyze_message(_inline_forward(quote="> "), get_settings())
    assert result.parse_status == "PARSED"


def test_attached_forward_with_authentic_original_is_parsed():
    result = analyze_message(_attached_forward(PASS_AUTH), get_settings())
    assert result.parse_status == "PARSED"
    assert "forwarded_attached_via" in (result.notes or "")


def test_attached_forward_without_original_auth_is_quarantined_with_alert():
    result = analyze_message(_attached_forward(None), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert result.alert


def test_forward_of_non_binance_original_is_quarantined_without_alert():
    result = analyze_message(_inline_forward(original_sender="x@evil.test"), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert not result.alert
    assert result.parsed is None


def test_forward_without_origin_block_is_quarantined():
    result = analyze_message(_mail(GOOD_BODY, sender=FWD, auth=FWD_AUTH), get_settings())
    assert result.parse_status == "QUARANTINED"


def test_forwarder_without_trusted_auth_is_quarantined_with_alert():
    result = analyze_message(_inline_forward(auth=None), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert result.alert


def test_unlisted_forwarder_is_quarantined_even_with_binance_block():
    result = analyze_message(_inline_forward(sender="other@forwarder.test"), get_settings())
    assert result.parse_status == "QUARANTINED"
    assert not result.sender_allowlisted


def test_malformed_message_is_quarantined_not_dropped():
    result = analyze_message(b"\x00\xff\xfe not an email", get_settings())
    assert result.parse_status == "QUARANTINED"
    assert result.sha256
