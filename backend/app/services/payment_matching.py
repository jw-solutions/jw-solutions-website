from __future__ import annotations

from collections.abc import Mapping
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.payment import STATUS_PENDING_REVIEW, PaymentReport
from app.models.payment_evidence import PaymentEvidence
from app.services.notification_service import enqueue

log = get_logger("JW-IMAP")


def _norm_tx(value: Any) -> str:
    return str(value).strip().casefold()  # unicidad en BD: lower(txid)


def payment_is_candidate(
    report: Mapping[str, Any],
    evidence: Mapping[str, Any],
    window_minutes: int = 15,
    expected_recipient: str | None = None,
) -> bool:
    """Candidatura de conciliación (NO aprobación). Fail-closed ante cualquier dato ausente o sin zona horaria."""
    if report.get("status") not in (STATUS_PENDING_REVIEW, "PENDING_REVIEW"):
        return False
    if not report.get("transaction_id") or not evidence.get("transaction_id"):
        return False
    if _norm_tx(report["transaction_id"]) != _norm_tx(evidence["transaction_id"]):
        return False
    if report.get("amount") is None or evidence.get("amount") is None:
        return False
    if Decimal(str(report["amount"])) != Decimal(str(evidence["amount"])):
        return False
    if not report.get("asset") or str(report["asset"]).upper() != str(evidence.get("asset") or "").upper():
        return False
    if expected_recipient is not None and str(evidence.get("recipient_id") or "") != expected_recipient:
        return False

    report_time = report.get("transaction_date")
    evidence_time = evidence.get("transferred_at")
    if report_time is None or evidence_time is None:
        return False
    if report_time.tzinfo is None or evidence_time.tzinfo is None:
        return False
    return abs(report_time - evidence_time) <= timedelta(minutes=window_minutes)


def _report_view(report: PaymentReport) -> dict[str, Any]:
    return {
        "status": report.status,
        "transaction_id": report.txid,
        "amount": report.amount,
        "asset": report.asset,
        "transaction_date": report.transaction_date,
    }


def _evidence_view(evidence: PaymentEvidence) -> dict[str, Any]:
    return {
        "transaction_id": evidence.transaction_id,
        "amount": evidence.amount,
        "asset": evidence.asset,
        "recipient_id": evidence.recipient_id,
        "transferred_at": evidence.transferred_at,
    }


def _alert(session: Session, evidence: PaymentEvidence, status: str, note: str) -> None:
    enqueue(
        session,
        "payment_evidence_alert",
        {
            "subject": f"Evidencia {status}",
            "evidence_id": evidence.id,
            "transaction_id": evidence.transaction_id,
            "amount": evidence.amount,
            "asset": evidence.asset,
            "report_id": evidence.matched_report_id,
            "note": note,
            "action": "Verifica el ingreso en la cuenta Binance oficial antes de aprobar.",
        },
        idempotency_key=f"evidence:{evidence.id}:{status}",
    )


def reconcile_evidence(session: Session, evidence_id: Any, settings: Settings) -> str:
    """Cruza una evidencia con reportes pendientes. Devuelve el match_status resultante.

    Nunca aprueba ni crea suscripciones: CANDIDATE solo avisa al administrador. VERIFIED lo fija únicamente
    `subscription_service.approve_payment_report` con confirmación autoritativa. Llamar dentro de una transacción.
    """
    evidence = session.execute(
        select(PaymentEvidence).where(PaymentEvidence.id == evidence_id).with_for_update()
    ).scalar_one()
    if evidence.match_status != "UNMATCHED":
        return evidence.match_status  # idempotente

    if evidence.parse_status == "QUARANTINED" or evidence.sender_auth_status != "PASS":
        return evidence.match_status  # nada que cruzar; ya quedó registrado para investigación

    if evidence.parse_status != "PARSED" or not evidence.transaction_id:
        evidence.match_status = "MANUAL_REVIEW"
        evidence.notes = "parse incompleto: requiere revisión manual"
        _alert(session, evidence, "MANUAL_REVIEW", evidence.notes)
        return evidence.match_status

    reports = list(
        session.execute(
            select(PaymentReport)
            .where(func.lower(PaymentReport.txid) == _norm_tx(evidence.transaction_id))
            .with_for_update()
        ).scalars()
    )
    if not reports:
        return "UNMATCHED"  # el usuario aún no reportó; se reintenta en cada ciclo

    window = settings.payment_match_window_minutes
    view = _evidence_view(evidence)
    candidates = [
        r
        for r in reports
        if payment_is_candidate(_report_view(r), view, window, expected_recipient=settings.payment_recipient_id)
    ]

    if len(candidates) > 1:
        evidence.match_status = "AMBIGUOUS"
        evidence.notes = f"{len(candidates)} reportes coinciden"
        _alert(session, evidence, "AMBIGUOUS", evidence.notes)
    elif len(candidates) == 1:
        evidence.match_status = "CANDIDATE"
        evidence.matched_report_id = candidates[0].report_id
        _alert(session, evidence, "CANDIDATE", "coincidencia única; pendiente de confirmación financiera")
    else:
        evidence.match_status = "MANUAL_REVIEW"
        evidence.notes = "existe reporte con ese ID pero monto, activo, fecha, destinatario o estado no coinciden"
        _alert(session, evidence, "MANUAL_REVIEW", evidence.notes)
    log.info("evidence %s -> %s", evidence.id, evidence.match_status)
    return evidence.match_status


def reconcile_unmatched(session: Session, settings: Settings, limit: int = 200) -> int:
    """Reintenta evidencias PARSED sin cruce (reportes creados después del correo). Devuelve cuántas cambiaron."""
    ids = list(
        session.execute(
            select(PaymentEvidence.id)
            .where(PaymentEvidence.match_status == "UNMATCHED", PaymentEvidence.parse_status == "PARSED")
            .order_by(PaymentEvidence.created_at)
            .limit(limit)
        ).scalars()
    )
    changed = 0
    for evidence_id in ids:
        if reconcile_evidence(session, evidence_id, settings) != "UNMATCHED":
            changed += 1
    return changed
