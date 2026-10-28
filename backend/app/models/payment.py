from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Estado de negocio PENDING_REVIEW del anexo == 'pending' en la tabla existente (el worker Node la usa así);
# APPROVED == 'verified'. No se renombran para no romper backend/code-formatter.
STATUS_PENDING_REVIEW = "pending"
STATUS_APPROVED = "verified"
STATUS_REJECTED = "rejected"


class PaymentReport(Base):
    __tablename__ = "payment_reports"

    report_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.account_id"), nullable=False)
    txid: Mapped[str] = mapped_column(String(128), nullable=False)
    asset: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    paid_at: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=STATUS_PENDING_REVIEW)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Añadidas por la migración 0001:
    provider: Mapped[str] = mapped_column(String(30), nullable=False, server_default="BINANCE_PAY")
    transaction_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(254))
