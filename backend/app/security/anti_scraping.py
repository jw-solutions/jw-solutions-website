from __future__ import annotations

import json
import re
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.logging import get_logger

log = get_logger("JW-DEFENSE")

MAX_TRACKED_KEYS = 2048
BURST_WINDOW_SECONDS = 60.0
BURST_THRESHOLD = 15

VERIFIED_BOT_TOKENS = (
    "googlebot",
    "bingbot",
    "applebot",
    "duckduckbot",
    "linkedinbot",
    "twitterbot",
    "slackbot",
    "whatsapp",
    "discordbot",
)

SCRIPT_UA_TOKENS = (
    "scrapy",
    "python-requests",
    "curl/",
    "wget/",
    "headlesschrome",
    "puppeteer",
    "playwright",
    "selenium",
    "httpx/",
    "aiohttp/",
)

ALLOWED_CRAWL_PREFIXES = ("/sitemap", "/robots.txt", "/tools/code-formatter/tips/feed")

MONETIZATION_DESTINATIONS: tuple[dict[str, str], ...] = (
    {
        "id": "code_formatter_pro",
        "label": "Code Formatter & Auto-Doc AI Pro",
        "url": "https://jw-solutions.com/tools/code-formatter/?mode=learn&open_plans=1",
    },
    {
        "id": "code_formatter_tool",
        "label": "Code Formatter Free Tool",
        "url": "https://jw-solutions.com/tools/code-formatter/",
    },
    {
        "id": "jw_solutions_contact",
        "label": "JW Solutions Consulting & Services",
        "url": "https://jw-solutions.com/#contacto",
    },
)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_LONG_TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{24,}")


@dataclass(frozen=True)
class RiskAssessment:
    risk_score: int
    risk_level: str  # clean | suspicious | confirmed_bot
    user_agent_class: str
    signals: tuple[str, ...]
    action_taken: str
    monetization_event: str | None = None
    monetization_target: str | None = None


def classify_user_agent(user_agent: str | None) -> str:
    ua = (user_agent or "").strip().lower()
    if not ua:
        return "missing"
    if any(tok in ua for tok in VERIFIED_BOT_TOKENS):
        return "verified_bot"
    if any(tok in ua for tok in SCRIPT_UA_TOKENS):
        return "headless_or_script"
    return "browser"


def sanitize_route(raw_path: str | None) -> str:
    """Elimina query strings, correos y tokens largos de la ruta antes de registrar telemetría."""
    path = str(raw_path or "/").split("?", 1)[0].strip()
    path = _EMAIL_RE.sub("[redacted-email]", path)
    path = _LONG_TOKEN_RE.sub("[redacted-token]", path)
    return (path[:120] or "/")


class AntiScrapingEngine:
    """Clasificación gradual de riesgo (clean / suspicious / confirmed_bot) con memoria acotada."""

    def __init__(self, *, max_keys: int = MAX_TRACKED_KEYS) -> None:
        self._max_keys = max_keys
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def reset(self) -> None:
        self._hits.clear()

    def _record_hit(self, client_key: str, now_ts: float) -> int:
        bucket = self._hits.get(client_key)
        if bucket is None:
            if len(self._hits) >= self._max_keys:
                self._hits.popitem(last=False)
            bucket = deque()
            self._hits[client_key] = bucket
        else:
            self._hits.move_to_end(client_key)

        cutoff = now_ts - BURST_WINDOW_SECONDS
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        bucket.append(now_ts)
        return len(bucket)

    def assess_request(
        self,
        *,
        client_key: str,
        route: str,
        user_agent: str | None,
        accept_header: str | None = "",
        origin_coherent: bool = True,
        has_session: bool = False,
        honeypot_triggered: bool = False,
        decoy_triggered: bool = False,
        now_ts: float | None = None,
    ) -> RiskAssessment:
        clean_route = sanitize_route(route)
        ua_class = classify_user_agent(user_agent)

        # Tráfico legítimo verificado o rutas de indexación/feeds nunca se penalizan
        if ua_class == "verified_bot" and not honeypot_triggered and not decoy_triggered:
            return RiskAssessment(
                risk_score=0,
                risk_level="clean",
                user_agent_class="verified_bot",
                signals=(),
                action_taken="allow_verified",
            )
        if any(clean_route.startswith(p) for p in ALLOWED_CRAWL_PREFIXES) and not honeypot_triggered:
            return RiskAssessment(
                risk_score=0,
                risk_level="clean",
                user_agent_class=ua_class,
                signals=(),
                action_taken="allow_feed",
            )

        ts = now_ts if now_ts is not None else time.monotonic()
        hits = self._record_hit(client_key or "unknown", ts)

        score = 0
        signals: list[str] = []

        if hits >= BURST_THRESHOLD:
            score += 35
            signals.append("burst_rate")
        if ua_class == "missing":
            score += 20
            signals.append("missing_ua")
        elif ua_class == "headless_or_script" and not has_session:
            score += 25
            signals.append("script_ua")
        if not (accept_header or "").strip():
            score += 15
            signals.append("missing_accept")
        if not origin_coherent:
            score += 20
            signals.append("origin_mismatch")
        if honeypot_triggered:
            score += 85
            signals.append("honeypot_field")
        if decoy_triggered:
            score += 85
            signals.append("decoy_endpoint")

        score = min(100, score)

        if score >= 80:
            dest = MONETIZATION_DESTINATIONS[0]
            return RiskAssessment(
                risk_score=score,
                risk_level="confirmed_bot",
                user_agent_class=ua_class,
                signals=tuple(signals),
                action_taken="route_public_monetization",
                monetization_event="public_offer_routed",
                monetization_target=dest["url"],
            )
        if score >= 40:
            return RiskAssessment(
                risk_score=score,
                risk_level="suspicious",
                user_agent_class=ua_class,
                signals=tuple(signals),
                action_taken="monitor_soft_limit",
            )
        return RiskAssessment(
            risk_score=score,
            risk_level="clean",
            user_agent_class=ua_class,
            signals=tuple(signals),
            action_taken="allow",
        )

    def emit_telemetry(self, assessment: RiskAssessment, *, route: str) -> dict[str, Any]:
        """Emite evento estructurado compacto sin PII ni secretos."""
        record: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "route": sanitize_route(route),
            "user_agent_class": assessment.user_agent_class,
            "risk_score": assessment.risk_score,
            "risk_level": assessment.risk_level,
            "action_taken": assessment.action_taken,
            "monetization_event": assessment.monetization_event,
        }
        log.info(json.dumps(record, separators=(",", ":"), ensure_ascii=True))
        return record


defense_engine = AntiScrapingEngine()
