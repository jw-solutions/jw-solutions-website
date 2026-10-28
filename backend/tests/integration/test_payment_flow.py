import threading
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import session_scope
from app.models.payment_evidence import PaymentEvidence
from app.services.payment_matching import reconcile_evidence, reconcile_unmatched
from app.services.subscription_service import (
    EvidenceMismatch,
    PaymentAlreadyApplied,
    ReportNotPending,
    approve_payment_report,
)
from app.workers.imap_reconciliation import store_evidence

PASS_AUTH = "spf=pass; dkim=pass header.d=binance.test; dmarc=pass header.from=binance.test"
BODY = "Amount: 1,012.50 USDT\nTransaction ID: TX123456789\nTransaction Time: 2026-10-27T14:30:00Z\nReceiver ID: 188552430\n"


def mail(body=BODY, extra_header=""):
    return (
        f"From: Binance <notify@binance.test>\r\nSubject: Payment\r\n{extra_header}"
        f"Authentication-Results: mx.google.com; {PASS_AUTH}\r\nContent-Type: text/plain\r\n\r\n{body}"
    ).encode()


def ingest(raw, uid, validity=1):
    with session_scope() as s:
        evidence, _ = store_evidence(s, raw=raw, mailbox="m@x.test", uidvalidity=validity, uid=uid, settings=get_settings())
        return evidence.id if evidence else None


def count(sql, **p):
    with session_scope() as s:
        return s.execute(text(sql), p).scalar()


def test_email_candidate_never_creates_subscription(make_account, make_report):
    account = make_account()
    evidence_id = ingest(mail(), uid=1)
    with session_scope() as s:
        assert reconcile_evidence(s, evidence_id, get_settings()) == "UNMATCHED"  # aún no hay reporte
    report_id = make_report(account)
    with session_scope() as s:
        assert reconcile_unmatched(s, get_settings()) == 1
    with session_scope() as s:
        ev = s.get(PaymentEvidence, evidence_id)
        assert ev.match_status == "CANDIDATE" and ev.matched_report_id == report_id
    assert count("SELECT count(*) FROM subscriptions") == 0
    assert count("SELECT status FROM payment_reports") == "pending"
    assert count("SELECT plan FROM accounts") == "free"
    assert count("SELECT count(*) FROM notification_outbox WHERE event_type='payment_evidence_alert' AND status='queued'") == 1


def test_amount_mismatch_goes_to_manual_review(make_account, make_report):
    make_report(make_account(), amount="1012.51")
    evidence_id = ingest(mail(), uid=1)
    with session_scope() as s:
        assert reconcile_evidence(s, evidence_id, get_settings()) == "MANUAL_REVIEW"


def test_duplicate_message_by_uid_hash_and_txid(make_account):
    assert ingest(mail(), uid=1) is not None
    assert ingest(mail(), uid=1) is None  # mismo UID
    assert ingest(mail(), uid=99) is None  # mismo contenido (hash) con UID nuevo, p. ej. tras cambiar UIDVALIDITY
    forwarded = mail(extra_header="X-Forwarded: yes\r\n")  # otro hash, mismo ID de transacción
    dup_id = ingest(forwarded, uid=2)
    with session_scope() as s:
        ev = s.get(PaymentEvidence, dup_id)
        assert ev.parse_status == "QUARANTINED" and ev.transaction_id is None and "duplicate_transaction_id" in ev.notes
    assert count("SELECT count(*) FROM payment_evidence WHERE transaction_id IS NOT NULL") == 1


def _approve(report_id, evidence_id=None, confirmed=True):
    with session_scope() as s:
        return approve_payment_report(
            s, get_settings(), report_id=report_id, approved_by="admin@jw", authoritative_confirmation=confirmed, evidence_id=evidence_id
        )


def test_approval_with_confirmation_activates_pro_once(make_account, make_report):
    account = make_account()
    report_id = make_report(account)
    evidence_id = ingest(mail(), uid=1)
    with session_scope() as s:
        reconcile_evidence(s, evidence_id, get_settings())
    sub = _approve(report_id, evidence_id)
    assert sub.status == "ACTIVE"
    assert count("SELECT plan FROM accounts") == "pro"
    assert count("SELECT match_status FROM payment_evidence") == "VERIFIED"
    assert count("SELECT status FROM payment_reports") == "verified"
    assert count("SELECT count(*) FROM notification_outbox WHERE event_type='payment_approved'") == 1
    with pytest.raises(ReportNotPending):
        _approve(report_id)
    assert count("SELECT count(*) FROM subscriptions") == 1


def test_approval_rejects_foreign_evidence(make_account, make_report):
    account = make_account()
    report_id = make_report(account)
    other = make_report(account, txid="TX000000001")
    evidence_id = ingest(mail(), uid=1)
    with session_scope() as s:
        reconcile_evidence(s, evidence_id, get_settings())  # candidata de `report_id`, no de `other`
    with pytest.raises(EvidenceMismatch):
        _approve(other, evidence_id)
    assert count("SELECT count(*) FROM subscriptions") == 0


def test_concurrent_approvals_apply_exactly_once(make_account, make_report):
    report_id = make_report(make_account())
    results: list[str] = []

    def worker():
        try:
            _approve(report_id)
            results.append("ok")
        except (ReportNotPending, PaymentAlreadyApplied) as exc:
            results.append(type(exc).__name__)

    threads = [threading.Thread(target=worker) for _ in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count("ok") == 1 and len(results) == 6
    assert count("SELECT count(*) FROM subscriptions") == 1


def test_renewal_extends_from_current_expiry(make_account, make_report):
    account = make_account()
    first = _approve(make_report(account, txid="TX111111111"))
    second = _approve(make_report(account, txid="TX222222222"))
    assert second.starts_at == first.expires_at
    assert (second.expires_at - second.starts_at).days == get_settings().pro_plan_days
    assert datetime.now(timezone.utc) < first.expires_at
