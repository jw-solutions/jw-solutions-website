from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, SmallInteger, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Account(Base):
    """Tabla `accounts` creada por backend/code-formatter/db/002_accounts_payments.sql (no la gestiona Alembic)."""

    __tablename__ = "accounts"

    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="free")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    certificate_holder_name: Mapped[str | None] = mapped_column(String(140), nullable=True)
    certificate_name_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    certificate_name_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    portfolio_slug: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    birth_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    birth_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    birthday_last_sent_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    preferred_lang: Mapped[str | None] = mapped_column(String(10), nullable=True)
