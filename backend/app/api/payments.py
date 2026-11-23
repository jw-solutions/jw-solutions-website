from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.account import Account
from app.models.payment import PaymentReport
from app.models.payment_order import (
    ORDER_STATUS_EXPIRED,
    ORDER_STATUS_PAID,
    ORDER_STATUS_PENDING,
    PaymentOrder,
)
from app.models.subscription import Subscription
from app.security.csrf import require_csrf
from app.security.rate_limit import payment_limiter
from app.security.sessions import SessionInfo
from app.services.certificate_service import revoke_certificates_for_subscription
from app.services.notification_service import enqueue
from app.services.order_service import (
    AmountMismatchError,
    OrderExpiredError,
    OrderNotFoundError,
    activate_paid_order,
    create_or_reuse_order,
    report_order_txid,
    revoke_paid_order,
)
from app.services.payment_channels import (
    PLANS,
    ChannelNotConfiguredError,
    PayPalAPIError,
    available_channels,
    calculate_paypal_pricing,
    capture_paypal_order,
    get_plan,
    verify_paypal_webhook_signature,
)

router = APIRouter(prefix="/api")

TX_RE = re.compile(r"^[A-Za-z0-9_-]{6,128}$")
AMOUNT_RE = re.compile(r"^\d{1,9}(\.\d{1,8})?$")
MAX_AGE_DAYS = 90
EVENT_PAYMENT_REPORTED = "payment_report_created"


class PaymentReportBody(BaseModel):
    """Mismo contrato que el frontend (pro-modal.js): { txid, asset, amount, paid_at }."""

    model_config = ConfigDict(extra="forbid")

    txid: str
    asset: Literal["USDT", "USDC", "FDUSD", "BNB", "BTC", "ETH"]
    amount: str  # cadena decimal: evita errores de coma flotante
    paid_at: date
    attribution_utm: dict[str, str] | None = None

    @field_validator("attribution_utm")
    @classmethod
    def _attribution_utm(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        allowed = {"utm_source", "utm_medium", "utm_campaign"}
        cleaned = {k: str(val)[:128] for k, val in v.items() if k in allowed and val}
        return cleaned or None

    @field_validator("txid")
    @classmethod
    def _txid(cls, v: str) -> str:
        if not TX_RE.fullmatch(v):
            raise ValueError("txid inválido")
        return v

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: str) -> str:
        if not AMOUNT_RE.fullmatch(v) or Decimal(v) <= 0:
            raise ValueError("amount inválido")
        return v

    @field_validator("paid_at")
    @classmethod
    def _paid_at(cls, v: date) -> date:
        today = datetime.now(timezone.utc).date()
        if v > today + timedelta(days=1) or v < today - timedelta(days=MAX_AGE_DAYS):  # 1 día de margen horario
            raise ValueError("fecha fuera de rango")
        return v


@router.post("/payments/report", status_code=201)
def report_payment(
    body: PaymentReportBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    payment_limiter.check(str(session.account_id))
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")

    report = PaymentReport(
        account_id=account.account_id,
        txid=body.txid,
        asset=body.asset,
        amount=Decimal(body.amount),
        paid_at=body.paid_at,
        attribution_utm=body.attribution_utm,
    )
    try:
        # SAVEPOINT: el duplicado (índice único lower(txid)) no invalida la transacción de la petición.
        with db.begin_nested():
            db.add(report)
            db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Duplicate transaction") from None

    # Reporte y evento de notificación en la misma transacción (outbox).
    enqueue(
        db,
        EVENT_PAYMENT_REPORTED,
        {
            "report_id": str(report.report_id),
            "account_email": account.email,
            "txid": body.txid,
            "asset": body.asset,
            "amount": body.amount,
            "paid_at": body.paid_at.isoformat(),
        },
        idempotency_key=f"payment_report_created:{report.report_id}",
    )
    return {"ok": True, "reportId": str(report.report_id)}


# --- Checkout Multicanal (Órdenes JW-XXXXXXXXX + Webhooks) -------------------------------------------------------

ORDER_TX_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
JW_CODE_RE = re.compile(r"\b(JW-[A-Z0-9]{9})\b")


class CreateOrderBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: Literal["pro_30d", "pro_90d", "pro_365d"]
    channel: Literal["binance_p2p", "crypto_gateway", "paypal_checkout", "paypal_imap", "kofi_webhook"]
    attribution_utm: dict[str, str] | None = None

    @field_validator("attribution_utm")
    @classmethod
    def _attribution_utm(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        allowed = {"utm_source", "utm_medium", "utm_campaign"}
        cleaned = {k: str(val)[:128] for k, val in v.items() if k in allowed and val}
        return cleaned or None


class OrderReportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    txid: str

    @field_validator("txid")
    @classmethod
    def _txid(cls, v: str) -> str:
        cleaned = v.strip()
        if not ORDER_TX_RE.fullmatch(cleaned):
            raise ValueError("txid inválido (6 a 80 caracteres alfanuméricos)")
        return cleaned


def _serialize_order(order: PaymentOrder, settings) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    exp = order.expires_at if order.expires_at.tzinfo else order.expires_at.replace(tzinfo=timezone.utc)
    ttl_remaining = max(0, int((exp - now).total_seconds()))
    status = ORDER_STATUS_EXPIRED if (order.status == ORDER_STATUS_PENDING and ttl_remaining == 0) else order.status
    data: dict[str, Any] = {
        "order_code": order.order_code,
        "plan_id": order.plan_id,
        "days": order.days_to_grant,
        "channel": order.channel,
        "amount_usd": f"{Decimal(order.amount_usd):.2f}",
        "currency": order.currency,
        "status": status,
        "expires_at": exp.isoformat(),
        "ttl_seconds_remaining": ttl_remaining,
        "checkout_url": order.provider_checkout_url,
        "invoice_id": order.provider_invoice_id,
    }
    if order.channel == "binance_p2p":
        data["binance_uid"] = settings.binance_p2p_uid
        data["holder_name"] = settings.binance_p2p_holder_name
    elif order.channel == "paypal_checkout":
        plan = get_plan(order.plan_id)
        pricing = calculate_paypal_pricing(plan["amount_usd"], settings)
        data["pricing"] = {
            "base_amount": f"{pricing['base_amount']:.2f}",
            "fee_amount": f"{pricing['fee_amount']:.2f}",
            "total_amount": f"{pricing['total_amount']:.2f}",
            "currency": pricing["currency"],
            "pass_fees_to_client": pricing["pass_fees_to_client"],
        }
    return data


@router.get("/payments/channels")
def list_channels() -> dict[str, Any]:
    settings = get_settings()
    return {
        "plans": {
            k: {"id": v["id"], "days": v["days"], "amount_usd": f"{v['amount_usd']:.2f}", "currency": v["currency"]}
            for k, v in PLANS.items()
        },
        "channels": available_channels(settings),
    }


@router.post("/payments/orders", status_code=201)
def create_order(
    body: CreateOrderBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    payment_limiter.check(f"order:{session.account_id}")
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")

    settings = get_settings()
    try:
        order = create_or_reuse_order(
            db,
            settings,
            account=account,
            plan_id=body.plan_id,
            channel=body.channel,
            attribution_utm=body.attribution_utm,
        )
    except ChannelNotConfiguredError:
        raise HTTPException(status_code=503, detail="CHANNEL_NOT_CONFIGURED") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None

    return _serialize_order(order, settings)


@router.get("/payments/orders/{order_code}")
def get_order_status(
    order_code: str,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    order = db.execute(
        select(PaymentOrder).where(
            PaymentOrder.order_code == order_code.strip().upper(),
            PaymentOrder.account_id == session.account_id,
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    settings = get_settings()
    return _serialize_order(order, settings)


@router.post("/payments/orders/{order_code}/report")
def report_order(
    order_code: str,
    body: OrderReportBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    payment_limiter.check(f"order_report:{session.account_id}")
    order = db.execute(
        select(PaymentOrder).where(
            PaymentOrder.order_code == order_code.strip().upper(),
            PaymentOrder.account_id == session.account_id,
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    settings = get_settings()
    try:
        updated, activated = report_order_txid(db, settings, order_id=order.id, txid=body.txid)
    except OrderExpiredError:
        raise HTTPException(status_code=410, detail="ORDER_EXPIRED") from None
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail="Order not found") from None

    return {"ok": True, "status": updated.status, "activated": activated}


def _verify_nowpayments_sig(payload: dict[str, Any], signature: str, secret: str) -> bool:
    canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    expected = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected.lower(), signature.strip().lower())


def _verify_hmac_sha256(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.lower(), signature.strip().lower())


@router.post("/webhooks/crypto")
async def crypto_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid JSON") from None

    settings = get_settings()
    ipn_secret = settings.nowpayments_ipn_secret.get_secret_value().strip()
    cryptomus_key = settings.cryptomus_api_key.get_secret_value().strip()

    now_sig = request.headers.get("x-nowpayments-sig")
    sha256_sig = request.headers.get("x-signature-sha256") or request.headers.get("sign")

    verified = False
    if now_sig and ipn_secret:
        verified = _verify_nowpayments_sig(payload, now_sig, ipn_secret)
    elif sha256_sig and (ipn_secret or cryptomus_key):
        verified = _verify_hmac_sha256(raw_body, sha256_sig, ipn_secret or cryptomus_key)

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payment_status = str(payload.get("payment_status") or payload.get("status") or "").lower()
    if payment_status in ("refunded", "chargeback", "reversed"):
        order_code = str(payload.get("order_id") or "").strip().upper()
        if order_code:
            rev_order = db.execute(select(PaymentOrder).where(PaymentOrder.order_code == order_code)).scalar_one_or_none()
            if rev_order is not None:
                sub = db.execute(select(Subscription).where(Subscription.payment_order_id == rev_order.id)).scalar_one_or_none()
                if sub is not None:
                    sub.status = "REVOKED"
                    revoke_certificates_for_subscription(db, sub.subscription_id, f"Payment {payment_status}")
        return {"ok": True, "revoked": True, "status": payment_status}

    if payment_status not in ("finished", "confirmed", "paid", "paid_over"):
        return {"ok": True, "ignored": True, "status": payment_status}

    order_code = str(payload.get("order_id") or "").strip().upper()
    external_txid = str(payload.get("payment_id") or payload.get("uuid") or payload.get("txid") or "").strip()
    if not order_code or not external_txid:
        raise HTTPException(status_code=400, detail="Missing order_id or payment_id")

    order = db.execute(select(PaymentOrder).where(PaymentOrder.order_code == order_code)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    raw_paid = payload.get("price_amount") or payload.get("actually_paid_at_fiat") or payload.get("payment_amount_usd") or payload.get("amount")
    paid_amount: Decimal | None = None
    if raw_paid is not None:
        try:
            paid_amount = Decimal(str(raw_paid))
        except InvalidOperation:
            raise HTTPException(status_code=400, detail="Invalid amount") from None

    try:
        _, _, activated = activate_paid_order(
            db,
            order_id=order.id,
            channel="crypto_gateway",
            external_txid=external_txid,
            webhook_event_id=f"crypto:{external_txid}",
            paid_amount=paid_amount,
            allow_fee_tolerance=True,
            approved_by="crypto_webhook",
        )
    except AmountMismatchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return {"ok": True, "order_code": order.order_code, "activated": activated}


@router.post("/webhooks/kofi")
async def kofi_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_settings()
    expected_token = settings.kofi_verification_token.get_secret_value().strip()
    if not expected_token:
        raise HTTPException(status_code=503, detail="CHANNEL_NOT_CONFIGURED")

    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        raw_data = str(form.get("data") or "")
    else:
        raw_data = (await request.body()).decode("utf-8", errors="replace")

    try:
        payload = json.loads(raw_data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Ko-fi payload") from None

    supplied_token = str(payload.get("verification_token") or "")
    if not supplied_token or not hmac.compare_digest(supplied_token, expected_token):
        raise HTTPException(status_code=401, detail="Invalid verification token")

    message = str(payload.get("message") or "")
    buyer_email = str(payload.get("email") or "").strip().lower()
    txid = str(payload.get("kofi_transaction_id") or "").strip()
    if not txid:
        raise HTTPException(status_code=400, detail="Missing kofi_transaction_id")

    try:
        paid_amount = Decimal(str(payload.get("amount") or "0"))
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Invalid amount") from None

    code_match = JW_CODE_RE.search(message.upper())
    order: PaymentOrder | None = None
    if code_match:
        order = db.execute(select(PaymentOrder).where(PaymentOrder.order_code == code_match.group(1))).scalar_one_or_none()
    elif buyer_email:
        order = db.execute(
            select(PaymentOrder)
            .join(Account, Account.account_id == PaymentOrder.account_id)
            .where(
                func.lower(Account.email) == buyer_email,
                PaymentOrder.channel == "kofi_webhook",
                PaymentOrder.status == ORDER_STATUS_PENDING,
                PaymentOrder.amount_usd == paid_amount,
            )
            .order_by(PaymentOrder.created_at.desc())
        ).scalars().first()

    if order is None:
        return {"ok": True, "matched": False}

    try:
        _, _, activated = activate_paid_order(
            db,
            order_id=order.id,
            channel="kofi_webhook",
            external_txid=txid,
            webhook_event_id=f"kofi:{txid}",
            paid_amount=paid_amount,
            allow_fee_tolerance=False,
            approved_by="kofi_webhook",
        )
    except AmountMismatchError:
        return {"ok": True, "matched": False, "reason": "amount_mismatch"}

    return {"ok": True, "order_code": order.order_code, "activated": activated}


# --- PayPal Orders v2 Capture & Signed Webhook ------------------------------------------------------------------

PAYPAL_ORDER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
PAYPAL_ADVERSE_EVENTS = frozenset(
    {
        "PAYMENT.CAPTURE.REFUNDED",
        "PAYMENT.CAPTURE.REVERSED",
        "CUSTOMER.DISPUTE.CREATED",
    }
)


class PayPalCaptureBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paypal_order_id: str

    @field_validator("paypal_order_id")
    @classmethod
    def _paypal_order_id(cls, v: str) -> str:
        cleaned = v.strip()
        if not PAYPAL_ORDER_ID_RE.fullmatch(cleaned):
            raise ValueError("paypal_order_id inválido")
        return cleaned


@router.post("/payments/paypal/capture")
def capture_paypal(
    body: PayPalCaptureBody,
    session: Annotated[SessionInfo, Depends(require_csrf)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    payment_limiter.check(f"paypal_capture:{session.account_id}")
    account = db.get(Account, session.account_id)
    if account is None or account.status != "active":
        raise HTTPException(status_code=401, detail="Not authenticated")

    settings = get_settings()
    if not settings.paypal_rest_configured:
        raise HTTPException(status_code=503, detail="CHANNEL_NOT_CONFIGURED")

    order = db.execute(
        select(PaymentOrder).where(
            PaymentOrder.provider_invoice_id == body.paypal_order_id,
            PaymentOrder.account_id == session.account_id,
            PaymentOrder.channel == "paypal_checkout",
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == ORDER_STATUS_PAID:
        return {
            "ok": True,
            "order_code": order.order_code,
            "status": ORDER_STATUS_PAID,
            "activated": False,
            "already_paid": True,
        }

    now = datetime.now(timezone.utc)
    exp = order.expires_at if order.expires_at.tzinfo else order.expires_at.replace(tzinfo=timezone.utc)
    if exp <= now:
        order.status = ORDER_STATUS_EXPIRED
        raise HTTPException(status_code=410, detail="ORDER_EXPIRED")

    try:
        captured = capture_paypal_order(settings, paypal_order_id=body.paypal_order_id)
    except PayPalAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None

    if captured["capture_status"] != "COMPLETED":
        raise HTTPException(status_code=409, detail=f"PAYPAL_STATUS_{captured['capture_status'] or 'INCOMPLETE'}")

    if captured["currency"] != order.currency.upper():
        raise HTTPException(status_code=422, detail="CURRENCY_MISMATCH")

    if captured["custom_id"] and captured["custom_id"] != order.order_code.upper():
        raise HTTPException(status_code=422, detail="ORDER_MISMATCH")

    txid = captured["capture_id"] or body.paypal_order_id
    try:
        _, _, activated = activate_paid_order(
            db,
            order_id=order.id,
            channel="paypal_checkout",
            external_txid=txid,
            webhook_event_id=f"paypal_capture:{txid}",
            paid_amount=captured["amount"],
            allow_fee_tolerance=False,
            approved_by="paypal_capture",
            now=now,
        )
    except AmountMismatchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return {
        "ok": True,
        "order_code": order.order_code,
        "status": ORDER_STATUS_PAID,
        "activated": activated,
        "already_paid": not activated,
    }


def _find_paypal_order_from_resource(db: Session, resource: dict[str, Any]) -> PaymentOrder | None:
    custom_id = str(resource.get("custom_id") or "").strip().upper()
    if custom_id:
        order = db.execute(select(PaymentOrder).where(PaymentOrder.order_code == custom_id)).scalar_one_or_none()
        if order is not None:
            return order

    related = (resource.get("supplementary_data") or {}).get("related_ids") or {}
    paypal_order_id = str(related.get("order_id") or "").strip()
    if paypal_order_id:
        order = db.execute(
            select(PaymentOrder).where(PaymentOrder.provider_invoice_id == paypal_order_id)
        ).scalar_one_or_none()
        if order is not None:
            return order

    # En disputas / reembolsos el capture_id puede venir en disputed_transactions o en links/id
    tx_candidates: list[str] = []
    res_id = str(resource.get("id") or "").strip()
    if res_id:
        tx_candidates.append(res_id)
    for dt in resource.get("disputed_transactions") or []:
        if isinstance(dt, dict):
            for key in ("seller_transaction_id", "buyer_transaction_id"):
                val = str(dt.get(key) or "").strip()
                if val:
                    tx_candidates.append(val)
    for link in resource.get("links") or []:
        if isinstance(link, dict) and link.get("rel") == "up" and isinstance(link.get("href"), str):
            tail = link["href"].rstrip("/").split("/")[-1]
            if tail:
                tx_candidates.append(tail)

    for tx in tx_candidates:
        order = db.execute(select(PaymentOrder).where(PaymentOrder.reported_txid == tx)).scalar_one_or_none()
        if order is not None:
            return order
    return None


@router.post("/webhooks/paypal")
async def paypal_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON object")

    settings = get_settings()
    if not verify_paypal_webhook_signature(settings, headers=dict(request.headers), webhook_event=payload):
        raise HTTPException(status_code=401, detail="Invalid PayPal webhook signature")

    event_id = str(payload.get("id") or "").strip()
    event_type = str(payload.get("event_type") or "").strip().upper()
    resource = payload.get("resource") if isinstance(payload.get("resource"), dict) else {}
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event id or event_type")

    order = _find_paypal_order_from_resource(db, resource)
    if order is None:
        return {"ok": True, "matched": False, "event_type": event_type}

    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        amt_obj = resource.get("amount") if isinstance(resource.get("amount"), dict) else {}
        currency = str(amt_obj.get("currency_code") or "").strip().upper()
        if currency and currency != order.currency.upper():
            raise HTTPException(status_code=422, detail="CURRENCY_MISMATCH")
        try:
            paid_amount = Decimal(str(amt_obj.get("value") or "0"))
        except InvalidOperation:
            raise HTTPException(status_code=400, detail="Invalid amount") from None
        capture_id = str(resource.get("id") or event_id).strip()
        try:
            _, _, activated = activate_paid_order(
                db,
                order_id=order.id,
                channel="paypal_checkout",
                external_txid=capture_id,
                webhook_event_id=f"paypal_event:{event_id}",
                paid_amount=paid_amount,
                allow_fee_tolerance=False,
                approved_by="paypal_webhook",
            )
        except AmountMismatchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        return {"ok": True, "order_code": order.order_code, "activated": activated}

    if event_type in PAYPAL_ADVERSE_EVENTS:
        txid = str(resource.get("id") or event_id).strip()
        revoked, revoked_certs = revoke_paid_order(
            db,
            order_id=order.id,
            channel="paypal_checkout",
            external_txid=txid,
            webhook_event_id=f"paypal_event:{event_id}",
            reason=f"PayPal {event_type}",
        )
        return {
            "ok": True,
            "order_code": order.order_code,
            "revoked": revoked,
            "revoked_certificates": revoked_certs,
            "event_type": event_type,
        }

    return {"ok": True, "ignored": True, "event_type": event_type}
