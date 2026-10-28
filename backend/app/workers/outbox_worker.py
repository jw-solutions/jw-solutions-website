"""Worker del Outbox: envía eventos 'queued' con FOR UPDATE SKIP LOCKED, lease y reintentos exponenciales.

Ejecutar:  python -m app.workers.outbox_worker [--once]
Ciclo de estados: queued -> processing -> sent | failed. Los 'processing' con lease vencido (worker caído)
se reclaman. El worker Node solo toca status='pending', por lo que ambos coexisten en la misma tabla.
"""
from __future__ import annotations

import argparse
import signal
import threading
from typing import Any

from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.database import session_scope
from app.core.logging import get_logger
from app.services.notification_service import PermanentDeliveryError, render, send_email

log = get_logger("JW-OUTBOX")

BATCH_SIZE = 25
LEASE_SECONDS = 300
MAX_ATTEMPTS = 8
POLL_SECONDS = 15

_CLAIM = text(
    """
    WITH due AS (
        SELECT id
          FROM notification_outbox
         WHERE (status = 'queued' AND next_attempt_at <= now())
            OR (status = 'processing' AND locked_until < now())
         ORDER BY id
           FOR UPDATE SKIP LOCKED
         LIMIT :batch
    )
    UPDATE notification_outbox AS events
       SET status = 'processing',
           attempts = events.attempts + 1,
           locked_until = now() + make_interval(secs => :lease)
      FROM due
     WHERE events.id = due.id
    RETURNING events.id, events.event_type, events.payload, events.attempts
    """
)

_MARK_SENT = text(
    "UPDATE notification_outbox SET status = 'sent', sent_at = now(), locked_until = NULL, last_error = NULL "
    "WHERE id = :id AND status = 'processing'"
)
_MARK_RETRY = text(
    "UPDATE notification_outbox SET status = :status, locked_until = NULL, last_error = :err, "
    "next_attempt_at = now() + make_interval(secs => :delay) WHERE id = :id AND status = 'processing'"
)


def claim_batch(batch: int = BATCH_SIZE, lease: int = LEASE_SECONDS) -> list[dict[str, Any]]:
    with session_scope() as session:  # la reclamación se confirma antes de enviar: sin locks durante el SMTP
        rows = session.execute(_CLAIM, {"batch": batch, "lease": lease}).mappings().all()
    return [dict(r) for r in rows]


def process_event(settings: Settings, event: dict[str, Any]) -> str:
    """Devuelve 'sent', 'retry' o 'failed'."""
    try:
        to, subject, body = render(event["event_type"], event["payload"], settings)
        send_email(settings, to, subject, body)
    except PermanentDeliveryError as exc:
        _finish(event["id"], "failed", str(exc), 0)
        return "failed"
    except Exception as exc:  # noqa: BLE001 - SMTP caído, timeout, etc.: reintentar con backoff
        dead = event["attempts"] >= MAX_ATTEMPTS
        _finish(event["id"], "failed" if dead else "queued", f"{type(exc).__name__}: {exc}", min(3600, 30 * 2 ** event["attempts"]))
        return "failed" if dead else "retry"
    with session_scope() as session:
        session.execute(_MARK_SENT, {"id": event["id"]})
    return "sent"


def _finish(event_id: int, status: str, error: str, delay: int) -> None:
    with session_scope() as session:
        session.execute(_MARK_RETRY, {"id": event_id, "status": status, "err": error[:500], "delay": delay})


def run_once(settings: Settings) -> dict[str, int]:
    counts = {"sent": 0, "retry": 0, "failed": 0}
    for event in claim_batch():
        counts[process_event(settings, event)] += 1
    if any(counts.values()):
        log.info("%d notification(s) delivered, %d retrying, %d failed.", counts["sent"], counts["retry"], counts["failed"])
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="JW Solutions outbox worker")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())

    log.info("worker started")
    while not stop.is_set():
        try:
            run_once(settings)
        except Exception:  # noqa: BLE001 - p.ej. PostgreSQL sin conexión: registrar y seguir
            log.exception("outbox cycle failed")
        if args.once:
            break
        stop.wait(POLL_SECONDS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
