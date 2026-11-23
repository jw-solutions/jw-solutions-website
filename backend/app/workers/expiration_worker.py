"""Worker diario de vencimientos (systemd timer, tipo oneshot).

Ejecutar:  python -m app.workers.expiration_worker
1) Crea recordatorios a 3 y 1 días (y 0 si REMINDER_DAYS lo incluye) en notification_outbox, idempotentes vía
   subscription_reminders (UNIQUE subscription_id + scheduled_expiration + reminder_days).
2) Marca EXPIRED las suscripciones vencidas y retira el plan PRO.
No envía correos ni cobra: solo encola eventos.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_engine, session_scope
from app.core.locks import LOCK_EXPIRATION, advisory_lock
from app.core.logging import get_logger
from app.services.notification_service import enqueue
from app.services.subscription_service import expire_due_subscriptions

log = get_logger("JW-CRON")


def expiration_window(reminder_days: int, business_timezone: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    """[inicio, fin) en UTC del día comercial `hoy + reminder_days`. Respeta cambios de horario de verano."""
    zone = ZoneInfo(business_timezone)
    local_now = now.astimezone(zone) if now else datetime.now(zone)
    target = local_now.date() + timedelta(days=reminder_days)
    start_local = datetime.combine(target, time.min, tzinfo=zone)
    end_local = datetime.combine(target + timedelta(days=1), time.min, tzinfo=zone)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


_SELECT_DUE = text(
    """
    SELECT s.subscription_id, s.expires_at, a.email
      FROM subscriptions s
      JOIN accounts a ON a.account_id = s.account_id
     WHERE s.status = 'ACTIVE'
       AND a.status = 'active'
       AND s.expires_at >= :window_start
       AND s.expires_at <  :window_end
     ORDER BY s.expires_at ASC
    """
)

_INSERT_REMINDER = text(
    """
    INSERT INTO subscription_reminders (subscription_id, reminder_days, scheduled_expiration)
    VALUES (:sid, :days, :expires)
    ON CONFLICT ON CONSTRAINT unique_subscription_reminder DO NOTHING
    RETURNING id
    """
)


def create_reminders(session: Session, settings: Settings, days: int, now: datetime | None = None) -> int:
    """Una transacción por llamada; el INSERT ... ON CONFLICT DO NOTHING hace seguras las re-ejecuciones y crons concurrentes."""
    start, end = expiration_window(days, settings.business_timezone, now)
    created = 0
    for subscription_id, expires_at, email in session.execute(_SELECT_DUE, {"window_start": start, "window_end": end}).all():
        reminder = session.execute(_INSERT_REMINDER, {"sid": subscription_id, "days": days, "expires": expires_at}).first()
        if reminder is None:
            continue  # ya existe para este ciclo de vencimiento
        event_id = enqueue(
            session,
            "subscription_reminder",
            {
                "to": email,
                "reminder_days": days,
                "expires_at": expires_at.isoformat(),
                "plan_name": settings.pro_plan_name,
                "renewal_amount": settings.pro_renewal_amount,
            },
            idempotency_key=f"reminder:{subscription_id}:{days}:{expires_at.isoformat()}",
        )
        session.execute(
            text("UPDATE subscription_reminders SET outbox_event_id = :e WHERE id = :id"),
            {"e": event_id, "id": reminder[0]},
        )
        created += 1
    return created


def enqueue_birthday_greetings(session: Session, settings: Settings, now: datetime | None = None) -> int:
    """Encola saludo anual de cumpleaños solo para cuentas con fecha opcional registrada (máx. 1 vez por año)."""
    zone = ZoneInfo(settings.business_timezone)
    local_today = (now.astimezone(zone) if now else datetime.now(zone)).date()
    month, day, year = local_today.month, local_today.day, local_today.year

    dialect_name = getattr(getattr(session, "bind", None), "dialect", None)
    lock_clause = " FOR UPDATE SKIP LOCKED" if getattr(dialect_name, "name", "") != "sqlite" else ""
    rows = session.execute(
        text(
            f"""
            SELECT account_id, email, preferred_lang
              FROM accounts
             WHERE status = 'active'
               AND birth_month = :month
               AND birth_day = :day
               AND (birthday_last_sent_year IS NULL OR birthday_last_sent_year < :year)
             ORDER BY account_id ASC{lock_clause}
            """
        ),
        {"month": month, "day": day, "year": year},
    ).all()

    sent = 0
    for account_id, email, preferred_lang in rows:
        event_id = enqueue(
            session,
            "birthday_greeting",
            {
                "to": email,
                "lang": preferred_lang or "es",
                "year": year,
            },
            idempotency_key=f"birthday_greeting:{account_id}:{year}",
        )
        session.execute(
            text("UPDATE accounts SET birthday_last_sent_year = :year WHERE account_id = :aid"),
            {"year": year, "aid": account_id},
        )
        if event_id is not None:
            sent += 1
    return sent


def run_once(settings: Settings, now: datetime | None = None) -> dict[str, int]:
    result = {"reminders_created": 0, "expired": 0, "birthdays_queued": 0}
    for days in settings.reminder_days_tuple:
        try:
            with session_scope() as session:  # BEGIN ... COMMIT; ROLLBACK si falla
                result["reminders_created"] += create_reminders(session, settings, days, now)
        except Exception:  # noqa: BLE001 - un fallo en una ventana no debe impedir las demás ni el vencimiento
            log.exception("reminder creation failed for %d-day window", days)
    with session_scope() as session:
        result["expired"] = expire_due_subscriptions(session, now)
    try:
        with session_scope() as session:
            result["birthdays_queued"] = enqueue_birthday_greetings(session, settings, now)
    except Exception:  # noqa: BLE001 - cumpleaños opcional nunca bloquea el worker principal
        log.exception("birthday greeting sweep failed")
    return result


def main() -> int:
    settings = get_settings()
    with advisory_lock(get_engine(), LOCK_EXPIRATION) as acquired:
        if not acquired:
            log.warning("another expiration worker is running; exiting")
            return 1
        result = run_once(settings)
    log.info("%d expiration reminder(s) created, %d subscription(s) expired.", result["reminders_created"], result["expired"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
