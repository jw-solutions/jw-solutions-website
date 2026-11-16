from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

_JSON = JSON().with_variant(JSONB, "postgresql")
_BIGINT = BigInteger().with_variant(Integer, "sqlite")


class UserLearningProgress(Base):
    __tablename__ = "user_learning_progress"

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.account_id", ondelete="CASCADE"), primary_key=True
    )
    completed: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    remedial_completed: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    daily_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_daily_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("account_id", "achievement_id", name="uq_user_achievements_account_ach"),)

    id: Mapped[int] = mapped_column(_BIGINT, primary_key=True, autoincrement=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=False
    )
    achievement_id: Mapped[str] = mapped_column(String(64), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RemedialAttempt(Base):
    __tablename__ = "remedial_attempts"

    id: Mapped[int] = mapped_column(_BIGINT, primary_key=True, autoincrement=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=False
    )
    level_id: Mapped[str] = mapped_column(String(64), nullable=False)
    error_type: Mapped[str] = mapped_column(String(32), nullable=False)
    drill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyProLevel(Base):
    __tablename__ = "academy_pro_levels"
    __table_args__ = (UniqueConstraint("tech", "level", "locale", name="uq_academy_pro_levels_tech_lvl_loc"),)

    id: Mapped[int] = mapped_column(_BIGINT, primary_key=True, autoincrement=True)
    tech: Mapped[str] = mapped_column(String(32), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="es")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict] = mapped_column(_JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyHintCache(Base):
    __tablename__ = "academy_hint_cache"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    challenge_id: Mapped[str] = mapped_column(String(80), nullable=False)
    error_code: Mapped[str] = mapped_column(String(64), nullable=False)
    ast_signature: Mapped[str] = mapped_column(String(128), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="es")
    hint_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyLevelTelemetry(Base):
    __tablename__ = "academy_level_telemetry"

    id: Mapped[int] = mapped_column(_BIGINT, primary_key=True, autoincrement=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.account_id", ondelete="SET NULL"), nullable=True
    )
    level_id: Mapped[str] = mapped_column(String(64), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyCertificate(Base):
    __tablename__ = "academy_certificates"
    __table_args__ = (UniqueConstraint("account_id", "cert_type", "target_slug", name="uq_academy_cert_account_type_target"),)

    cert_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.subscription_id", ondelete="SET NULL"), nullable=True, index=True
    )
    path_id: Mapped[str] = mapped_column(String(64), nullable=False)
    holder_name: Mapped[str] = mapped_column(String(120), nullable=False)
    holder_full_name: Mapped[str] = mapped_column(String(140), nullable=False)
    cert_type: Mapped[str] = mapped_column(String(32), nullable=False, default="language", server_default="language")
    target_slug: Mapped[str] = mapped_column(String(80), nullable=False)
    language_code: Mapped[str] = mapped_column(String(16), nullable=False, default="es", server_default="es")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid", server_default="valid")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    signature: Mapped[str] = mapped_column(String(64), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
