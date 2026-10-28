from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.payment_matching import payment_is_candidate
from app.services.subscription_service import AuthoritativeConfirmationRequired, approve_payment_report

NOW = datetime(2026, 10, 27, 14, 30, tzinfo=timezone.utc)


def _report(**over):
    base = {"status": "pending", "transaction_id": "TX123456789", "amount": Decimal("12.00"), "asset": "USDT", "transaction_date": NOW}
    return {**base, **over}


def _evidence(**over):
    base = {"transaction_id": "TX123456789", "amount": Decimal("12.00"), "asset": "USDT", "recipient_id": "188552430", "transferred_at": NOW}
    return {**base, **over}


def test_exact_match():
    assert payment_is_candidate(_report(), _evidence(), expected_recipient="188552430")


def test_spec_status_literal_is_accepted():
    assert payment_is_candidate(_report(status="PENDING_REVIEW"), _evidence())


@pytest.mark.parametrize(
    "report_over,evidence_over",
    [
        ({}, {"amount": Decimal("12.01")}),
        ({}, {"asset": "USDC"}),
        ({}, {"transaction_id": "TX999999999"}),
        ({"status": "verified"}, {}),
        ({}, {"recipient_id": "999999"}),
        ({}, {"transferred_at": NOW + timedelta(minutes=16)}),
        ({}, {"transferred_at": NOW.replace(tzinfo=None)}),
        ({"transaction_date": None}, {}),
        ({}, {"amount": None}),
    ],
)
def test_mismatches_are_rejected(report_over, evidence_over):
    assert not payment_is_candidate(_report(**report_over), _evidence(**evidence_over), expected_recipient="188552430")


def test_window_edge_is_inclusive():
    assert payment_is_candidate(_report(), _evidence(transferred_at=NOW + timedelta(minutes=15)))


def test_txid_comparison_matches_db_lowercase_uniqueness():
    assert payment_is_candidate(_report(transaction_id="tx123456789"), _evidence())


def test_amount_uses_exact_decimal():
    assert payment_is_candidate(_report(amount=Decimal("0.1") + Decimal("0.2")), _evidence(amount=Decimal("0.3")))


def test_email_evidence_alone_never_approves():
    from app.core.config import get_settings

    with pytest.raises(AuthoritativeConfirmationRequired):
        approve_payment_report(
            session=None,  # type: ignore[arg-type]  # se rechaza antes de tocar la BD
            settings=get_settings(),
            report_id=None,  # type: ignore[arg-type]
            approved_by="system",
            authoritative_confirmation=False,
        )
