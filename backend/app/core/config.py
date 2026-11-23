from __future__ import annotations

from decimal import Decimal
from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    """Configuración desde entorno / .env. Nunca imprimir ni loguear esta clase (contiene secretos)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"

    database_url: SecretStr

    session_secret: SecretStr
    session_ttl: int = 43200
    session_cookie_name: str = "__Host-jw_session"
    allowed_origins: str = "https://jw-solutions.com,https://www.jw-solutions.com"

    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    imap_username: str = ""
    imap_mailbox: str = "INBOX"
    imap_poll_seconds: int = 120
    imap_batch_limit: int = 50
    google_client_id: SecretStr = SecretStr("")
    google_client_secret: SecretStr = SecretStr("")
    google_refresh_token: SecretStr = SecretStr("")

    binance_notification_senders: str = ""
    paypal_notification_senders: str = "service@paypal.com"
    trusted_forwarders: str = ""  # cuentas propias que reenvían correos de Binance (p. ej. la cuenta que los recibe primero)
    trusted_authserv_id: str = "mx.google.com"

    payment_recipient_id: str = "188552430"
    payment_match_window_minutes: int = 15
    payment_review_required: bool = True

    auto_activate_verified_p2p: bool = True
    binance_p2p_uid: str = "188552430"
    binance_p2p_holder_name: str = "JW_Sol"
    binance_p2p_order_ttl_seconds: int = 86400

    nowpayments_api_key: SecretStr = SecretStr("")
    nowpayments_ipn_secret: SecretStr = SecretStr("")
    cryptomus_api_key: SecretStr = SecretStr("")
    cryptomus_merchant_id: str = ""
    paypal_me_url: str = ""
    paypal_mode: str = "sandbox"
    paypal_client_id: str = ""
    paypal_client_secret: SecretStr = SecretStr("")
    paypal_webhook_id: SecretStr = SecretStr("")
    paypal_currency: str = "USD"
    paypal_pass_fees_to_client: bool = False
    paypal_fee_percent: Decimal = Decimal("0.054")
    paypal_fee_fixed: Decimal = Decimal("0.30")
    paypal_return_url: str = "https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=paypal_return"
    paypal_cancel_url: str = "https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=cancel"
    kofi_page_url: str = ""
    kofi_verification_token: SecretStr = SecretStr("")

    business_timezone: str = "America/New_York"
    reminder_days: str = "3,1"
    pro_plan_id: str = "pro"
    pro_plan_name: str = "JW Solutions PRO"
    pro_plan_days: int = 30
    pro_renewal_amount: str = ""

    mail_host: str = ""
    mail_port: int = 587
    mail_username: str = ""
    mail_password: SecretStr = SecretStr("")
    mail_from: str = "notifications@jw-solutions.com"
    mail_to: str = "contact@jw-solutions.com"

    newsletter_webhook_token: SecretStr = SecretStr("")
    newsletter_base_url: str = "https://api.jw-solutions.com"

    @field_validator("session_secret")
    @classmethod
    def _secret_strength(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("SESSION_SECRET debe tener al menos 32 caracteres")
        return v

    @field_validator("payment_review_required")
    @classmethod
    def _review_always_required(cls, v: bool) -> bool:
        if not v:
            raise ValueError("PAYMENT_REVIEW_REQUIRED=false no está soportado: la aprobación automática por correo está prohibida")
        return v

    @field_validator("session_cookie_name")
    @classmethod
    def _host_prefix(cls, v: str) -> str:
        if not v.startswith("__Host-"):
            raise ValueError("SESSION_COOKIE_NAME debe usar el prefijo __Host-")
        return v

    @field_validator("allowed_origins")
    @classmethod
    def _origins_explicit(cls, v: str) -> str:
        items = _csv(v)
        if not items:
            raise ValueError("ALLOWED_ORIGINS no puede estar vacío")
        for origin in items:
            if "*" in origin or not origin.startswith("https://") and not origin.startswith("http://localhost"):
                raise ValueError(f"Origen no permitido en ALLOWED_ORIGINS: {origin!r}")
        return v

    @field_validator("reminder_days")
    @classmethod
    def _reminder_days_valid(cls, v: str) -> str:
        days = [int(d) for d in _csv(v)]
        if not days or any(d not in (3, 1, 0) for d in days):
            raise ValueError("REMINDER_DAYS solo admite 3, 1 y 0")
        return v

    @property
    def allowed_origins_list(self) -> list[str]:
        return _csv(self.allowed_origins)

    @property
    def sender_allowlist(self) -> frozenset[str]:
        return frozenset(s.lower() for s in _csv(self.binance_notification_senders))

    @property
    def paypal_sender_allowlist(self) -> frozenset[str]:
        return frozenset(s.lower() for s in _csv(self.paypal_notification_senders))

    @property
    def forwarder_allowlist(self) -> frozenset[str]:
        return frozenset(s.lower() for s in _csv(self.trusted_forwarders))

    @property
    def reminder_days_tuple(self) -> tuple[int, ...]:
        return tuple(int(d) for d in _csv(self.reminder_days))

    @field_validator("paypal_mode")
    @classmethod
    def _paypal_mode_valid(cls, v: str) -> str:
        cleaned = str(v or "").strip().lower()
        return "live" if cleaned == "live" else "sandbox"

    @field_validator("paypal_currency")
    @classmethod
    def _paypal_currency_valid(cls, v: str) -> str:
        cleaned = str(v or "").strip().upper()
        if len(cleaned) != 3 or not cleaned.isalpha():
            raise ValueError("PAYPAL_CURRENCY debe ser un código ISO-4217 de 3 letras (ej. USD)")
        return cleaned

    @field_validator("paypal_fee_percent")
    @classmethod
    def _paypal_fee_percent_valid(cls, v: Decimal) -> Decimal:
        if v < 0 or v >= Decimal("50"):
            raise ValueError("PAYPAL_FEE_PERCENT fuera de rango permitido")
        return v

    @field_validator("paypal_fee_fixed")
    @classmethod
    def _paypal_fee_fixed_valid(cls, v: Decimal) -> Decimal:
        if v < 0 or v > Decimal("100"):
            raise ValueError("PAYPAL_FEE_FIXED fuera de rango permitido")
        return v

    @property
    def paypal_api_base(self) -> str:
        return "https://api-m.paypal.com" if self.paypal_mode == "live" else "https://api-m.sandbox.paypal.com"

    @property
    def paypal_rest_configured(self) -> bool:
        return bool(self.paypal_client_id.strip() and self.paypal_client_secret.get_secret_value().strip())

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # los campos obligatorios vienen del entorno
