from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.academy import AcademyCertificate, UserLearningProgress
from app.models.account import Account
from app.models.subscription import Subscription

SUPPORTED_LANGS = frozenset({"es", "en", "pt-BR", "pt-PT", "fr", "de", "it"})
VALID_CERT_TYPES = frozenset({"language", "path", "annual_streak"})

PATH_TECHNOLOGIES: dict[str, tuple[str, ...]] = {
    "data-bi": ("sql", "dax", "python", "json"),
    "web-apis": ("javascript", "typescript", "php", "json"),
    "enterprise-cloud": ("java", "csharp", "yaml", "sql"),
}

PLAN_ALIASES: dict[str, str] = {
    "pro": "pro_30d",
    "pro_monthly": "pro_30d",
    "pro_30d": "pro_30d",
    "pro_quarterly": "pro_90d",
    "pro_90d": "pro_90d",
    "pro_annual": "pro_365d",
    "pro_365d": "pro_365d",
}

PLAN_CERT_RULES: dict[str, dict[str, Any]] = {
    "pro_30d": {
        "allowed_types": frozenset({"language"}),
        "quota_per_cycle": 2,
        "allow_all_languages": False,
        "allow_bilingual": False,
        "allow_linkedin_deeplink": False,
        "allow_portfolio": False,
    },
    "pro_90d": {
        "allowed_types": frozenset({"language", "path"}),
        "quota_per_cycle": 6,
        "allow_all_languages": True,
        "allow_bilingual": False,
        "allow_linkedin_deeplink": True,
        "allow_portfolio": False,
    },
    "pro_365d": {
        "allowed_types": frozenset({"language", "path", "annual_streak"}),
        "quota_per_cycle": None,
        "allow_all_languages": True,
        "allow_bilingual": True,
        "allow_linkedin_deeplink": True,
        "allow_portfolio": True,
    },
}


class CertificateError(Exception):
    def __init__(self, status_code: int, code: str, detail: str, extra: dict[str, Any] | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.extra = extra or {}


def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def sanitize_holder_name(raw: str | None) -> str:
    cleaned = re.sub(r"\s+", " ", str(raw or "")).strip()
    cleaned = re.sub(r"[\x00-\x1f\x7f<>]", "", cleaned)
    return cleaned[:140]


def generate_portfolio_slug(name: str, account_id: uuid.UUID) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32] or "dev"
    suffix = str(account_id).replace("-", "")[:8]
    return f"{base}-{suffix}"


def sign_certificate_payload(
    secret: str,
    *,
    cert_code: str,
    account_id: uuid.UUID,
    cert_type: str,
    target_slug: str,
    issued_iso: str,
) -> str:
    msg = f"cert:{cert_code}:{account_id}:{cert_type}:{target_slug}:{issued_iso}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def is_trial_subscription(sub: Subscription | None) -> bool:
    if sub is None:
        return False
    return sub.plan_id.lower() == "trial_7d" or (sub.approved_by or "").lower() == "trial_auto"


def resolve_plan_key(plan_id: str) -> str:
    return PLAN_ALIASES.get(plan_id.lower(), "pro_30d")


def get_active_subscription(
    db: Session,
    account_id: uuid.UUID,
    *,
    now: datetime | None = None,
    for_update: bool = False,
) -> Subscription | None:
    now = now or datetime.now(timezone.utc)
    stmt = (
        select(Subscription)
        .where(
            Subscription.account_id == account_id,
            Subscription.status == "ACTIVE",
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
        .limit(1)
    )
    if for_update:
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalar_one_or_none()


def check_requirements_met(
    db: Session,
    account_id: uuid.UUID,
    *,
    cert_type: str,
    target_slug: str,
) -> bool:
    progress = db.get(UserLearningProgress, account_id)
    if progress is None:
        return False
    completed = set(progress.completed or [])
    if cert_type == "language":
        tech = target_slug.lower()
        return {f"{tech}-1", f"{tech}-2"}.issubset(completed)
    if cert_type == "path":
        techs = PATH_TECHNOLOGIES.get(target_slug.lower())
        if not techs:
            return False
        required = {f"{t}-{lvl}" for t in techs for lvl in (1, 2)}
        return required.issubset(completed)
    if cert_type == "annual_streak":
        return int(progress.daily_streak or 0) >= 7 or len(completed) >= 10
    return False


def _cycle_issued_count(db: Session, account_id: uuid.UUID, sub: Subscription) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(AcademyCertificate)
            .where(
                AcademyCertificate.account_id == account_id,
                AcademyCertificate.subscription_id == sub.subscription_id,
            )
        ).scalar_one()
    )


def can_edit_holder_name(db: Session, account: Account, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if not account.certificate_holder_name or account.certificate_name_edited:
        return False
    if account.certificate_name_locked_at is None:
        return False
    locked_at = _ensure_utc(account.certificate_name_locked_at)
    if (now - locked_at) > timedelta(hours=24):
        return False
    total_views = int(
        db.execute(
            select(func.coalesce(func.sum(AcademyCertificate.verified_views_count), 0))
            .where(AcademyCertificate.account_id == account.account_id)
        ).scalar_one()
    )
    return total_views == 0


def _serialize_cert(cert: AcademyCertificate, *, rules: dict[str, Any] | None = None, account: Account | None = None) -> dict[str, Any]:
    issued_iso = _ensure_utc(cert.issued_at).replace(microsecond=0).isoformat()
    return {
        "cert_id": cert.cert_id,
        "cert_code": cert.cert_id,
        "cert_type": cert.cert_type,
        "target_slug": cert.target_slug,
        "path_id": cert.path_id,
        "holder_name": cert.holder_full_name or cert.holder_name,
        "holder_full_name": cert.holder_full_name or cert.holder_name,
        "language_code": cert.language_code,
        "status": cert.status,
        "issued_at": issued_iso,
        "signature": cert.signature,
        "signature_short": cert.signature[:12],
        "verified_views_count": cert.verified_views_count,
        "verify_url": f"https://jw-solutions.com/tools/code-formatter/cert/?id={cert.cert_id}",
        "allow_linkedin_deeplink": bool(rules["allow_linkedin_deeplink"]) if rules else False,
        "portfolio_url": (
            f"https://jw-solutions.com/tools/code-formatter/cert/?portfolio={account.portfolio_slug}"
            if (rules and rules.get("allow_portfolio") and account and account.portfolio_slug)
            else None
        ),
    }


def get_quota_status(db: Session, account: Account, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    sub = get_active_subscription(db, account.account_id, now=now)
    trial = is_trial_subscription(sub)
    plan_key = resolve_plan_key(sub.plan_id) if (sub and not trial) else None
    rules = PLAN_CERT_RULES.get(plan_key) if plan_key else None
    used = _cycle_issued_count(db, account.account_id, sub) if (sub and rules) else 0
    certs = list(
        db.execute(
            select(AcademyCertificate)
            .where(AcademyCertificate.account_id == account.account_id)
            .order_by(AcademyCertificate.issued_at.desc())
        ).scalars()
    )
    return {
        "has_active_subscription": sub is not None,
        "is_trial": trial,
        "plan_id": sub.plan_id if sub else "free",
        "plan_tier": plan_key or ("trial_7d" if trial else "free"),
        "used": used,
        "limit": rules["quota_per_cycle"] if rules else 0,
        "allowed_types": sorted(rules["allowed_types"]) if rules else [],
        "allow_all_languages": bool(rules["allow_all_languages"]) if rules else False,
        "allow_bilingual": bool(rules["allow_bilingual"]) if rules else False,
        "allow_linkedin_deeplink": bool(rules["allow_linkedin_deeplink"]) if rules else False,
        "allow_portfolio": bool(rules["allow_portfolio"]) if rules else False,
        "holder_full_name": account.certificate_holder_name,
        "can_edit_holder_name": can_edit_holder_name(db, account, now=now),
        "portfolio_slug": account.portfolio_slug,
        "certificates": [_serialize_cert(c, rules=rules, account=account) for c in certs],
    }


def issue_certificate_tx(
    db: Session,
    settings: Settings,
    account: Account,
    *,
    cert_type: str,
    target_slug: str,
    language_code: str,
    holder_full_name: str | None = None,
    ui_locale: str = "es",
    now: datetime | None = None,
) -> tuple[dict[str, Any], int]:
    now = now or datetime.now(timezone.utc)
    cert_type = cert_type.strip().lower()
    target_slug = target_slug.strip().lower()
    language_code = language_code.strip()

    if cert_type not in VALID_CERT_TYPES:
        raise CertificateError(422, "INVALID_CERT_TYPE", "Tipo de certificado inválido")

    # 1. Bloqueo pesimista sobre suscripción activa
    sub = get_active_subscription(db, account.account_id, now=now, for_update=True)
    if sub is None:
        raise CertificateError(403, "SUBSCRIPTION_REQUIRED", "Active paid subscription required")
    if is_trial_subscription(sub):
        raise CertificateError(403, "TRIAL_PREVIEW_ONLY", "Trial accounts can only preview certificates")

    plan_key = resolve_plan_key(sub.plan_id)
    rules = PLAN_CERT_RULES[plan_key]

    # 2. Verificar requisitos completados
    if not check_requirements_met(db, account.account_id, cert_type=cert_type, target_slug=target_slug):
        raise CertificateError(403, "REQUIREMENTS_NOT_MET", "Complete all required levels before issuing a certificate")

    # 3. Validar restricciones de plan
    if cert_type not in rules["allowed_types"]:
        raise CertificateError(403, "PLAN_TIER_REQUIRED", f"Plan {plan_key} does not allow {cert_type} certificates")

    if language_code == "bilingual":
        if not rules["allow_bilingual"]:
            raise CertificateError(403, "PLAN_LANGUAGE_RESTRICTED", "Bilingual certificates require Pro 365d")
    elif language_code not in SUPPORTED_LANGS:
        raise CertificateError(422, "INVALID_LANGUAGE", "Unsupported language code")
    elif not rules["allow_all_languages"] and language_code != ui_locale:
        raise CertificateError(403, "PLAN_LANGUAGE_RESTRICTED", "Pro 30d only issues certificates in your current interface language")

    # 4. Idempotencia por (account_id, cert_type, target_slug)
    existing = db.execute(
        select(AcademyCertificate).where(
            AcademyCertificate.account_id == account.account_id,
            AcademyCertificate.cert_type == cert_type,
            AcademyCertificate.target_slug == target_slug,
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.status == "revoked":
            raise CertificateError(403, "CERTIFICATE_REVOKED", "This certificate was revoked")
        if existing.language_code != language_code:
            existing.language_code = language_code
            db.flush()
        return _serialize_cert(existing, rules=rules, account=account), 200

    # 5. Validar cupo del ciclo
    quota_limit = rules["quota_per_cycle"]
    if quota_limit is not None:
        used = _cycle_issued_count(db, account.account_id, sub)
        if used >= quota_limit:
            raise CertificateError(
                403,
                "QUOTA_EXCEEDED",
                "Certificate quota exceeded for current subscription cycle",
                extra={"used": used, "limit": quota_limit},
            )

    # 6. Name-Locking
    if account.certificate_holder_name:
        final_name = account.certificate_holder_name
    else:
        final_name = sanitize_holder_name(holder_full_name)
        if len(final_name) < 3:
            raise CertificateError(422, "HOLDER_NAME_REQUIRED", "Legal full name (min 3 characters) is required")
        account.certificate_holder_name = final_name
        account.certificate_name_locked_at = now
        if rules["allow_portfolio"] and not account.portfolio_slug:
            account.portfolio_slug = generate_portfolio_slug(final_name, account.account_id)

    if rules["allow_portfolio"] and not account.portfolio_slug:
        account.portfolio_slug = generate_portfolio_slug(final_name, account.account_id)

    cert_code = f"JWS-CERT-{secrets.token_hex(5).upper()}"
    issued_at = now.replace(microsecond=0)
    secret = settings.session_secret.get_secret_value()
    sig = sign_certificate_payload(
        secret,
        cert_code=cert_code,
        account_id=account.account_id,
        cert_type=cert_type,
        target_slug=target_slug,
        issued_iso=issued_at.isoformat(),
    )
    cert = AcademyCertificate(
        cert_id=cert_code,
        account_id=account.account_id,
        subscription_id=sub.subscription_id,
        path_id=target_slug,
        holder_name=final_name[:120],
        holder_full_name=final_name,
        cert_type=cert_type,
        target_slug=target_slug,
        language_code=language_code,
        status="valid",
        signature=sig,
        issued_at=issued_at,
    )
    db.add(cert)
    db.flush()
    return _serialize_cert(cert, rules=rules, account=account), 201


def update_holder_name_tx(
    db: Session,
    account: Account,
    new_name: str,
    *,
    now: datetime | None = None,
) -> str:
    now = now or datetime.now(timezone.utc)
    if not can_edit_holder_name(db, account, now=now):
        raise CertificateError(403, "NAME_LOCKED", "Certificate holder name is permanently locked")
    cleaned = sanitize_holder_name(new_name)
    if len(cleaned) < 3:
        raise CertificateError(422, "HOLDER_NAME_REQUIRED", "Legal full name (min 3 characters) is required")

    account.certificate_holder_name = cleaned
    account.certificate_name_edited = True
    db.execute(
        update(AcademyCertificate)
        .where(AcademyCertificate.account_id == account.account_id)
        .values(holder_full_name=cleaned, holder_name=cleaned[:120])
    )
    db.flush()
    return cleaned


def verify_certificate_public(
    db: Session,
    settings: Settings,
    cert_code: str,
    *,
    increment_views: bool = True,
) -> dict[str, Any] | None:
    cert = db.get(AcademyCertificate, cert_code.strip())
    if cert is None:
        return None
    issued_iso = _ensure_utc(cert.issued_at).replace(microsecond=0).isoformat()
    secret = settings.session_secret.get_secret_value()

    if cert.cert_id.startswith("JWS-CERT-"):
        expected = sign_certificate_payload(
            secret,
            cert_code=cert.cert_id,
            account_id=cert.account_id,
            cert_type=cert.cert_type,
            target_slug=cert.target_slug,
            issued_iso=issued_iso,
        )
    else:
        # Compatibilidad con certificados históricos JW-* de 0004
        expected = hmac.new(
            secret.encode("utf-8"),
            f"cert:{cert.cert_id}:{cert.account_id}:{cert.path_id}:{issued_iso}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    sig_valid = hmac.compare_digest(expected, cert.signature)

    if cert.status == "revoked":
        return {
            "valid": False,
            "status": "revoked",
            "cert_id": cert.cert_id,
            "cert_code": cert.cert_id,
            "cert_type": cert.cert_type,
            "target_slug": cert.target_slug,
            "path_id": cert.path_id,
            "holder_name": cert.holder_full_name or cert.holder_name,
            "issued_at": issued_iso,
            "revoked_at": _ensure_utc(cert.revoked_at).isoformat() if cert.revoked_at else None,
            "revoked_reason": cert.revoked_reason or "Payment reversed",
            "signature": cert.signature,
            "signature_short": cert.signature[:12],
        }

    if increment_views and sig_valid:
        db.execute(
            update(AcademyCertificate)
            .where(AcademyCertificate.cert_id == cert.cert_id)
            .values(verified_views_count=AcademyCertificate.verified_views_count + 1)
        )
        db.flush()

    sub = db.get(Subscription, cert.subscription_id) if cert.subscription_id else None
    plan_tier = resolve_plan_key(sub.plan_id) if sub else "pro"
    return {
        "valid": sig_valid,
        "status": "valid" if sig_valid else "invalid",
        "cert_id": cert.cert_id,
        "cert_code": cert.cert_id,
        "cert_type": cert.cert_type,
        "target_slug": cert.target_slug,
        "path_id": cert.path_id,
        "holder_name": cert.holder_full_name or cert.holder_name,
        "language_code": cert.language_code,
        "issued_at": issued_iso,
        "signature": cert.signature,
        "signature_short": cert.signature[:12],
        "plan_tier_badge": plan_tier,
        "allow_linkedin_deeplink": bool(PLAN_CERT_RULES.get(plan_tier, {}).get("allow_linkedin_deeplink", False)),
    }


def get_portfolio_public(db: Session, portfolio_slug: str) -> dict[str, Any] | None:
    account = db.execute(
        select(Account).where(Account.portfolio_slug == portfolio_slug.strip().lower())
    ).scalar_one_or_none()
    if account is None:
        return None
    certs = list(
        db.execute(
            select(AcademyCertificate)
            .where(
                AcademyCertificate.account_id == account.account_id,
                AcademyCertificate.status == "valid",
            )
            .order_by(AcademyCertificate.issued_at.desc())
        ).scalars()
    )
    return {
        "portfolio_slug": account.portfolio_slug,
        "holder_name": account.certificate_holder_name or "JW Solutions Developer",
        "certificates": [_serialize_cert(c, rules=PLAN_CERT_RULES["pro_365d"], account=account) for c in certs],
    }


def revoke_certificates_for_subscription(
    db: Session,
    subscription_id: uuid.UUID,
    reason: str,
    *,
    now: datetime | None = None,
) -> int:
    now = now or datetime.now(timezone.utc)
    res = db.execute(
        update(AcademyCertificate)
        .where(
            AcademyCertificate.subscription_id == subscription_id,
            AcademyCertificate.status != "revoked",
        )
        .values(status="revoked", revoked_at=now, revoked_reason=reason[:255])
    )
    db.flush()
    return int(res.rowcount or 0)
