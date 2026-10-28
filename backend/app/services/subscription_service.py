from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.account import Account
from app.models.payment import STATUS_APPROVED, STATUS_PENDING_REVIEW, PaymentReport
from app.models.payment_evidence import PaymentEvidence
from app.models.subscription import Subscription
from app.services.notification_service import enqueue


class ApprovalError(Exception):
    pass


class AuthoritativeConfirmationRequired(ApprovalError):
    """Un correo IMAP, por sí solo, nunca acredita dinero."""


class ReportNotFound(ApprovalError):
    pass


class ReportNotPending(ApprovalError):
    pass


class EvidenceMismatch(ApprovalError):
    pass


class PaymentAlreadyApplied(ApprovalError):
    pass


def approve_payment_report(
    session: Session,
    settings: Settings,
    *,
    report_id: uuid.UUID,
    approved_by: str,
    authoritative_confirmation: bool,
    evidence_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> Subscription:
    """Aprobación transaccional (anexo §3.9). El llamador envuelve la llamada en `session_scope()`.

    `authoritative_confirmation=True` lo declara un administrador tras comprobar el ingreso en la cuenta Binance
    oficial (o el flujo Merchant tras webhook firmado + consulta de orden). Sin eso se rechaza siempre.
    """
    if not authoritative_confirmation:
        raise AuthoritativeConfirmationRequired("se requiere confirmación financiera autoritativa")
    now = now or datetime.now(timezone.utc)

    report = session.execute(
        select(PaymentReport).where(PaymentReport.report_id == report_id).with_for_update()
    ).scalar_one_or_none()
    if report is None:
        raise ReportNotFound(str(report_id))
    if report.status != STATUS_PENDING_REVIEW:
        raise ReportNotPending(f"estado actual: {report.status}")

    evidence: PaymentEvidence | None = None
    if evidence_id is not None:
        evidence = session.execute(
            select(PaymentEvidence).where(PaymentEvidence.id == evidence_id).with_for_update()
        ).scalar_one_or_none()
        if (
            evidence is None
            or evidence.match_status != "CANDIDATE"
            or evidence.matched_report_id != report.report_id
            or (evidence.transaction_id or "").strip().casefold() != report.txid.strip().casefold()
        ):
            raise EvidenceMismatch("la evidencia no corresponde al reporte")

    updated = session.execute(
        update(PaymentReport)
        .where(PaymentReport.report_id == report_id, PaymentReport.status == STATUS_PENDING_REVIEW)
        .values(status=STATUS_APPROVED, reviewed_at=now, reviewed_by=approved_by, review_notes="Verified payment")
    )
    if updated.rowcount != 1:
        raise ReportNotPending("el reporte cambió durante la aprobación")

    current_end = session.execute(
        select(func.max(Subscription.expires_at)).where(
            Subscription.account_id == report.account_id,
            Subscription.status == "ACTIVE",
            Subscription.expires_at > now,
        )
    ).scalar_one()
    starts_at = max(now, current_end) if current_end else now
    subscription = Subscription(
        account_id=report.account_id,
        plan_id=settings.pro_plan_id,
        status="ACTIVE",
        starts_at=starts_at,
        expires_at=starts_at + timedelta(days=settings.pro_plan_days),
        payment_report_id=report.report_id,
        approved_by=approved_by,
        approved_at=now,
    )
    try:
        with session.begin_nested():  # savepoint: un conflicto UNIQUE no envenena toda la transacción
            session.add(subscription)
            session.flush()
    except IntegrityError as exc:
        raise PaymentAlreadyApplied(str(report_id)) from exc

    session.execute(
        update(Account).where(Account.account_id == report.account_id, Account.status == "active").values(plan="pro")
    )
    if evidence is not None:
        evidence.match_status = "VERIFIED"

    email = session.execute(select(Account.email).where(Account.account_id == report.account_id)).scalar_one()
    enqueue(
        session,
        "payment_approved",
        {"to": email, "expires_at": subscription.expires_at.isoformat(), "report_id": str(report.report_id)},
        idempotency_key=f"payment_approved:{report.report_id}",
    )
    return subscription


def expire_due_subscriptions(session: Session, now: datetime | None = None) -> int:
    """ACTIVE vencidas -> EXPIRED y retiro del plan PRO si la cuenta no conserva otra suscripción vigente."""
    now = now or datetime.now(timezone.utc)
    rows = session.execute(
        text(
            "UPDATE subscriptions SET status = 'EXPIRED' "
            "WHERE status = 'ACTIVE' AND expires_at <= :now RETURNING account_id"
        ),
        {"now": now},
    ).all()
    account_ids = {r[0] for r in rows}
    for account_id in account_ids:
        still_active = session.execute(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.account_id == account_id, Subscription.status == "ACTIVE", Subscription.expires_at > now)
        ).scalar_one()
        if not still_active:
            session.execute(update(Account).where(Account.account_id == account_id).values(plan="free"))
    return len(rows)


def has_active_pro(session: Session, account_id: uuid.UUID, now: datetime | None = None) -> bool:
    """Todo endpoint comercial debe llamar esto: la sesión puede seguir viva tras el vencimiento."""
    now = now or datetime.now(timezone.utc)
    return bool(
        session.execute(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.account_id == account_id, Subscription.status == "ACTIVE", Subscription.expires_at > now)
        ).scalar_one()
    )
