from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.account import Account
from app.models.payment import PaymentReport
from app.security.csrf import require_csrf
from app.security.rate_limit import payment_limiter
from app.security.sessions import SessionInfo
from app.services.notification_service import enqueue

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
