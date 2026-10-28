from alembic import command
from sqlalchemy import text

from app.core.database import get_engine, session_scope


def _scalar(sql, **params):
    with get_engine().connect() as c:
        return c.execute(text(sql), params).scalar()


def test_tables_and_constraints_exist():
    for table in ("subscriptions", "payment_evidence", "subscription_reminders", "imap_mailbox_state"):
        assert _scalar("SELECT to_regclass(:t)", t=f"public.{table}") is not None
    names = {r[0] for r in get_engine().connect().execute(text("SELECT conname FROM pg_constraint"))}
    assert {"uq_subscriptions_payment_report", "unique_imap_message", "unique_subscription_reminder"} <= names


def test_node_outbox_contract_still_works_with_pending_status(make_account):
    """El worker Node inserta/lee status='pending' sin idempotency_key: debe seguir permitido."""
    with session_scope() as s:
        s.execute(text("INSERT INTO notification_outbox (event_type, payload) VALUES ('payment_reported', '{}')"))
    assert _scalar("SELECT status FROM notification_outbox") == "pending"


def test_deleting_account_cascades_through_subscriptions_and_reports(make_account, make_report):
    """Regresión: ON DELETE RESTRICT en subscriptions.payment_report_id bloquea el borrado en cascada."""
    from datetime import datetime, timedelta, timezone

    account = make_account()
    report = make_report(account)
    now = datetime.now(timezone.utc)
    with session_scope() as s:
        s.execute(
            text(
                "INSERT INTO subscriptions (account_id, plan_id, starts_at, expires_at, payment_report_id, approved_by) "
                "VALUES (:a, 'pro', :s, :e, :r, 'admin')"
            ),
            {"a": account, "s": now, "e": now + timedelta(days=30), "r": report},
        )
    with session_scope() as s:
        s.execute(text("DELETE FROM accounts WHERE account_id = :a"), {"a": account})
    assert _scalar("SELECT count(*) FROM subscriptions") == 0


def test_downgrade_and_upgrade_roundtrip(migrated_db):
    command.downgrade(migrated_db, "base")
    assert _scalar("SELECT to_regclass('public.subscriptions')") is None
    assert _scalar("SELECT to_regclass('public.payment_reports')") is not None  # tablas base intactas
    command.upgrade(migrated_db, "head")
    assert _scalar("SELECT to_regclass('public.subscriptions')") is not None
