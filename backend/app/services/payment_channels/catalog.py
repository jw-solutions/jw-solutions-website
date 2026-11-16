from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Any

from app.core.config import Settings

# Alfabeto sin ambigüedad visual (sin 0, O, 1, I)
_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

PLANS: dict[str, dict[str, Any]] = {
    "pro_30d": {"id": "pro_30d", "days": 30, "amount_usd": Decimal("12.00"), "currency": "USD"},
    "pro_90d": {"id": "pro_90d", "days": 90, "amount_usd": Decimal("30.00"), "currency": "USD"},
    "pro_365d": {"id": "pro_365d", "days": 365, "amount_usd": Decimal("99.00"), "currency": "USD"},
}

CHANNELS = ("binance_p2p", "crypto_gateway", "paypal_imap", "kofi_webhook")


class ChannelNotConfiguredError(RuntimeError):
    """El canal de pago solicitado no tiene credenciales configuradas en .env."""


def get_plan(plan_id: str) -> dict[str, Any]:
    if plan_id not in PLANS:
        raise ValueError(f"Plan desconocido: {plan_id}")
    return PLANS[plan_id]


def generate_order_code() -> str:
    """Genera código único de 12 caracteres: JW-XXXXXXXXX."""
    suffix = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(9))
    return f"JW-{suffix}"


def _has_nowpayments(settings: Settings) -> bool:
    return bool(settings.nowpayments_api_key.get_secret_value().strip())


def _has_cryptomus(settings: Settings) -> bool:
    return bool(settings.cryptomus_api_key.get_secret_value().strip() and settings.cryptomus_merchant_id.strip())


def available_channels(settings: Settings) -> dict[str, Any]:
    return {
        "binance_p2p": {
            "enabled": True,
            "uid": settings.binance_p2p_uid,
            "holder_name": settings.binance_p2p_holder_name,
            "ttl_seconds": settings.binance_p2p_order_ttl_seconds,
        },
        "crypto_gateway": {
            "enabled": _has_nowpayments(settings) or _has_cryptomus(settings),
            "provider": "nowpayments" if _has_nowpayments(settings) else ("cryptomus" if _has_cryptomus(settings) else None),
        },
        "paypal_imap": {
            "enabled": bool(settings.paypal_me_url.strip()),
            "url": settings.paypal_me_url.strip() or None,
        },
        "kofi_webhook": {
            "enabled": bool(settings.kofi_page_url.strip()),
            "url": settings.kofi_page_url.strip() or None,
        },
    }


def create_provider_invoice(
    settings: Settings,
    *,
    order_code: str,
    amount_usd: Decimal,
    plan_id: str,
) -> tuple[str, str]:
    """Crea un invoice en NOWPayments o Cryptomus y devuelve (invoice_id, checkout_url)."""
    if _has_nowpayments(settings):
        return _create_nowpayments_invoice(
            api_key=settings.nowpayments_api_key.get_secret_value().strip(),
            order_code=order_code,
            amount_usd=amount_usd,
            plan_id=plan_id,
        )
    if _has_cryptomus(settings):
        return _create_cryptomus_invoice(
            api_key=settings.cryptomus_api_key.get_secret_value().strip(),
            merchant_id=settings.cryptomus_merchant_id.strip(),
            order_code=order_code,
            amount_usd=amount_usd,
        )
    raise ChannelNotConfiguredError("CHANNEL_NOT_CONFIGURED")


def _create_nowpayments_invoice(
    *,
    api_key: str,
    order_code: str,
    amount_usd: Decimal,
    plan_id: str,
) -> tuple[str, str]:
    payload = {
        "price_amount": float(amount_usd),
        "price_currency": "usd",
        "order_id": order_code,
        "order_description": f"JW Solutions {plan_id} ({order_code})",
        "ipn_callback_url": "https://api.jw-solutions.com/api/webhooks/crypto",
        "success_url": "https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=success",
        "cancel_url": "https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=cancel",
    }
    req = urllib.request.Request(
        "https://api.nowpayments.io/v1/invoice",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"Error creando invoice NOWPayments: {exc}") from exc
    invoice_id = str(data.get("id") or "")
    invoice_url = str(data.get("invoice_url") or "")
    if not invoice_id or not invoice_url:
        raise RuntimeError("Respuesta incompleta de NOWPayments")
    return invoice_id, invoice_url


def _create_cryptomus_invoice(
    *,
    api_key: str,
    merchant_id: str,
    order_code: str,
    amount_usd: Decimal,
) -> tuple[str, str]:
    import base64

    payload = {
        "amount": f"{amount_usd:.2f}",
        "currency": "USD",
        "order_id": order_code,
        "url_callback": "https://api.jw-solutions.com/api/webhooks/crypto",
    }
    raw_json = json.dumps(payload, separators=(",", ":"))
    encoded = base64.b64encode(raw_json.encode("utf-8")).decode("ascii")
    sign = hashlib.md5((encoded + api_key).encode("utf-8")).hexdigest()  # Cryptomus API v1 signature
    req = urllib.request.Request(
        "https://api.cryptomus.com/v1/payment",
        data=raw_json.encode("utf-8"),
        headers={
            "merchant": merchant_id,
            "sign": sign,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError(f"Error creando invoice Cryptomus: {exc}") from exc
    result = data.get("result") or {}
    invoice_id = str(result.get("uuid") or "")
    invoice_url = str(result.get("url") or "")
    if not invoice_id or not invoice_url:
        raise RuntimeError("Respuesta incompleta de Cryptomus")
    return invoice_id, invoice_url
