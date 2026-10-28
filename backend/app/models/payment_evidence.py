from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PARSE_STATUSES = ("PARSED", "PARTIAL", "INVALID", "QUARANTINED")
MATCH_STATUSES = ("UNMATCHED", "CANDIDATE", "AMBIGUOUS", "MANUAL_REVIEW", "VERIFIED", "REJECTED")


class PaymentEvidence(Base):
    """Evidencia cruda de correos de Binance Pay. Separada de los datos que reporta el usuario."""

    __tablename__ = "payment_evidence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    provider: Mapped[str] = mapped_column(String(30), nullable=False, server_default="BINANCE_PAY")
    mailbox: Mapped[str] = mapped_column(String(254), nullable=False)
    mailbox_uidvalidity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mailbox_uid: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message_id: Mapped[str | None] = mapped_column(String(500))
    raw_message_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_address: Mapped[str] = mapped_column(String(254), nullable=False)
    sender_auth_status: Mapped[str] = mapped_column(String(30), nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(String(128))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(24, 10))
    asset: Mapped[str | None] = mapped_column(String(20))
    recipient_id: Mapped[str | None] = mapped_column(String(64))
    transferred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    parse_status: Mapped[str] = mapped_column(String(30), nullable=False)
    match_status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="UNMATCHED")
    matched_report_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_reports.report_id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ImapMailboxState(Base):
    """Registro persistente de UIDVALIDITY y último UID procesado por buzón."""

    __tablename__ = "imap_mailbox_state"

    mailbox: Mapped[str] = mapped_column(String(254), primary_key=True)
    folder: Mapped[str] = mapped_column(String(100), primary_key=True)
    uidvalidity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_uid: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
