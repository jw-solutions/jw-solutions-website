from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ORDER_STATUS_PENDING = "PENDING"
ORDER_STATUS_CANDIDATE = "CANDIDATE"
ORDER_STATUS_PAID = "PAID"
ORDER_STATUS_EXPIRED = "EXPIRED"


class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    order_code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.account_id"), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(32), nullable=False)
    days_to_grant: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, server_default="USD")
    provider_invoice_id: Mapped[str | None] = mapped_column(String(128))
    provider_checkout_url: Mapped[str | None] = mapped_column(Text)
    reported_txid: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=ORDER_STATUS_PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attribution_utm: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrialUsage(Base):
    __tablename__ = "trial_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.account_id"), nullable=False, unique=True)
    normalized_email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    device_fingerprint_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("channel", "external_txid", name="uq_webhook_channel_txid"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    webhook_event_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    external_txid: Mapped[str] = mapped_column(String(128), nullable=False)
    order_code: Mapped[str | None] = mapped_column(String(16))
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
