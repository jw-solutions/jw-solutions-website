from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.account import Account
from app.models.payment_evidence import PaymentEvidence
from app.models.payment_order import (
    ORDER_STATUS_CANDIDATE,
    ORDER_STATUS_EXPIRED,
    ORDER_STATUS_PAID,
    ORDER_STATUS_PENDING,
    PaymentOrder,
    WebhookEvent,
)
from app.models.subscription import Subscription
from app.services.notification_service import enqueue
from app.services.payment_channels import (
    ChannelNotConfiguredError,
    create_provider_invoice,
    generate_order_code,
    get_plan,
)
from app.services.subscription_service import grant_subscription_days

log = get_logger("JW-PAY")


class OrderError(Exception):
    pass


class OrderNotFoundError(OrderError):
    pass


class OrderExpiredError(OrderError):
    pass


class AmountMismatchError(OrderError):
    pass


def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def create_or_reuse_order(
    db: Session,
    settings: Settings,
    *,
    account: Account,
    plan_id: str,
    channel: str,
    attribution_utm: dict[str, str] | None = None,
    now: datetime | None = None,
) -> PaymentOrder:
    """Crea una orden PENDING con TTL 24h o reutiliza la vigente del mismo plan y canal."""
    now = now or datetime.now(timezone.utc)
    plan = get_plan(plan_id)

    # Validar configuración del canal antes de crear
    if channel == "paypal_imap" and not settings.paypal_me_url.strip():
        raise ChannelNotConfiguredError("CHANNEL_NOT_CONFIGURED")
    if channel == "kofi_webhook" and not settings.kofi_page_url.strip():
        raise ChannelNotConfiguredError("CHANNEL_NOT_CONFIGURED")

    # Reutilización idempotente de orden PENDING vigente
    existing = db.execute(
        select(PaymentOrder)
        .where(
            PaymentOrder.account_id == account.account_id,
            PaymentOrder.plan_id == plan_id,
            PaymentOrder.channel == channel,
            PaymentOrder.status == ORDER_STATUS_PENDING,
            PaymentOrder.expires_at > now,
        )
        .order_by(PaymentOrder.created_at.desc())
        .with_for_update()
    ).scalars().first()
    if existing is not None:
        return existing

    # Generar order_code único
    order_code = generate_order_code()
    for _ in range(5):
        exists = db.execute(select(PaymentOrder.id).where(PaymentOrder.order_code == order_code)).first()
        if exists is None:
            break
        order_code = generate_order_code()

    ttl = timedelta(seconds=settings.binance_p2p_order_ttl_seconds)
    provider_invoice_id: str | None = None
    provider_checkout_url: str | None = None
    currency = "USDT" if channel == "binance_p2p" else "USD"

    if channel == "crypto_gateway":
        provider_invoice_id, provider_checkout_url = create_provider_invoice(
            settings,
            order_code=order_code,
            amount_usd=plan["amount_usd"],
            plan_id=plan_id,
        )
    elif channel == "paypal_imap":
        provider_checkout_url = settings.paypal_me_url.strip()
    elif channel == "kofi_webhook":
        provider_checkout_url = settings.kofi_page_url.strip()

    order = PaymentOrder(
        order_code=order_code,
        account_id=account.account_id,
        plan_id=plan_id,
        days_to_grant=int(plan["days"]),
        channel=channel,
        amount_usd=plan["amount_usd"],
        currency=currency,
        provider_invoice_id=provider_invoice_id,
        provider_checkout_url=provider_checkout_url,
        status=ORDER_STATUS_PENDING,
        expires_at=now + ttl,
        attribution_utm=attribution_utm,
    )
    db.add(order)
    db.flush()
    return order


def activate_paid_order(
    db: Session,
    *,
    order_id: uuid.UUID,
    channel: str,
    external_txid: str,
    webhook_event_id: str | None = None,
    paid_amount: Decimal | None = None,
    allow_fee_tolerance: bool = False,
    approved_by: str = "auto",
    now: datetime | None = None,
) -> tuple[PaymentOrder, Subscription | None, bool]:
    """Activa una orden de pago con SELECT ... FOR UPDATE y triple llave de idempotencia.

    Devuelve (order, subscription, newly_activated).
    """
    now = now or datetime.now(timezone.utc)
    order = db.execute(
        select(PaymentOrder).where(PaymentOrder.id == order_id).with_for_update()
    ).scalar_one_or_none()
    if order is None:
        raise OrderNotFoundError(str(order_id))

    if order.status == ORDER_STATUS_PAID:
        return order, None, False

    if webhook_event_id is not None:
        try:
            with db.begin_nested():
                db.add(
                    WebhookEvent(
                        channel=channel,
                        webhook_event_id=webhook_event_id,
                        external_txid=external_txid,
                        order_code=order.order_code,
                    )
                )
                db.flush()
        except IntegrityError:
            # Evento o transacción ya procesados
            return order, None, False

    if paid_amount is not None:
        expected = Decimal(order.amount_usd)
        min_required = expected * Decimal("0.99") if allow_fee_tolerance else expected
        if paid_amount < min_required:
            raise AmountMismatchError(f"Esperado >= {min_required}, recibido {paid_amount}")

    order.status = ORDER_STATUS_PAID
    order.paid_at = now
    if not order.reported_txid and external_txid:
        order.reported_txid = external_txid[:128]

    subscription = grant_subscription_days(
        db,
        order.account_id,
        order.days_to_grant,
        plan_id=order.plan_id,
        approved_by=approved_by,
        payment_order_id=order.id,
        now=now,
    )

    email = db.execute(select(Account.email).where(Account.account_id == order.account_id)).scalar_one()
    enqueue(
        db,
        "order_paid",
        {
            "to": email,
            "order_code": order.order_code,
            "channel": channel,
            "plan_id": order.plan_id,
            "days": order.days_to_grant,
            "expires_at": subscription.expires_at.isoformat(),
        },
        idempotency_key=f"order_paid:{order.id}",
    )
    log.info("Orden %s activada (%s, +%d días)", order.order_code, channel, order.days_to_grant)
    return order, subscription, True


def report_order_txid(
    db: Session,
    settings: Settings,
    *,
    order_id: uuid.UUID,
    txid: str,
    now: datetime | None = None,
) -> tuple[PaymentOrder, bool]:
    """Registra el TxID reportado por el usuario y activa si ya existe evidencia IMAP verificada."""
    now = now or datetime.now(timezone.utc)
    clean_txid = txid.strip()
    order = db.execute(
        select(PaymentOrder).where(PaymentOrder.id == order_id).with_for_update()
    ).scalar_one_or_none()
    if order is None:
        raise OrderNotFoundError(str(order_id))
    if order.status == ORDER_STATUS_PAID:
        return order, True
    if _ensure_utc(order.expires_at) <= now:
        order.status = ORDER_STATUS_EXPIRED
        raise OrderExpiredError("La orden ha expirado")

    order.reported_txid = clean_txid
    order.status = ORDER_STATUS_CANDIDATE

    # Buscar evidencia IMAP ya autenticada con ese TxID
    evidence = db.execute(
        select(PaymentEvidence)
        .where(
            func.lower(PaymentEvidence.transaction_id) == clean_txid.lower(),
            PaymentEvidence.sender_auth_status == "PASS",
            PaymentEvidence.parse_status == "PARSED",
        )
        .with_for_update()
    ).scalars().first()

    if (
        evidence is not None
        and settings.auto_activate_verified_p2p
        and evidence.amount is not None
        and Decimal(evidence.amount) == Decimal(order.amount_usd)
    ):
        _, _, activated = activate_paid_order(
            db,
            order_id=order.id,
            channel=order.channel,
            external_txid=clean_txid,
            paid_amount=Decimal(evidence.amount),
            allow_fee_tolerance=False,
            approved_by="imap_auto",
            now=now,
        )
        evidence.match_status = "VERIFIED"
        evidence.matched_order_id = order.id
        return order, activated

    email = db.execute(select(Account.email).where(Account.account_id == order.account_id)).scalar_one()
    enqueue(
        db,
        "order_candidate_alert",
        {
            "order_code": order.order_code,
            "account_email": email,
            "channel": order.channel,
            "amount_usd": str(order.amount_usd),
            "txid": clean_txid,
        },
        idempotency_key=f"order_candidate:{order.id}:{clean_txid.lower()}",
    )
    return order, False
