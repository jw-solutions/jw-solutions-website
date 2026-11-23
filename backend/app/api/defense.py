from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.security.anti_scraping import MONETIZATION_DESTINATIONS, defense_engine
from app.security.rate_limit import RateLimiter, client_ip

router = APIRouter()

# Rate limit estricto exclusivo para endpoints señuelo (bajo consumo de recursos).
decoy_limiter = RateLimiter(window_seconds=60, max_hits=10)


def _handle_decoy(request: Request) -> dict[str, Any]:
    ip = client_ip(request)
    decoy_limiter.check(f"decoy:{ip}")
    assessment = defense_engine.assess_request(
        client_key=ip,
        route=request.url.path,
        user_agent=request.headers.get("user-agent"),
        accept_header=request.headers.get("accept"),
        decoy_triggered=True,
    )
    defense_engine.emit_telemetry(assessment, route=request.url.path)
    return {
        "status": "public_catalog",
        "message": "Explore JW Solutions public developer tools and Pro plans.",
        "links": [
            {"id": d["id"], "label": d["label"], "url": d["url"]}
            for d in MONETIZATION_DESTINATIONS
        ],
    }


@router.get("/api/_internal/export-dump", include_in_schema=False)
def decoy_export_dump(request: Request) -> dict[str, Any]:
    return _handle_decoy(request)


@router.get("/api/v1/private-catalog", include_in_schema=False)
def decoy_private_catalog(request: Request) -> dict[str, Any]:
    return _handle_decoy(request)


@router.get("/api/debug/metrics-raw", include_in_schema=False)
def decoy_metrics_raw(request: Request) -> dict[str, Any]:
    return _handle_decoy(request)
