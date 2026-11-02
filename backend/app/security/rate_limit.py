from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    """Ventana deslizante en memoria (por proceso). Suficiente para una instancia; con varias, mover a Redis/BD."""

    def __init__(self, window_seconds: float, max_hits: int) -> None:
        self.window = window_seconds
        self.max = max_hits
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.max:
                return False
            q.append(now)
            if len(self._hits) > 10_000:  # poda de claves inactivas
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                    del self._hits[k]
            return True

    def check(self, key: str) -> None:
        if not self.hit(key):
            raise HTTPException(status_code=429, detail="Too many requests")


def client_ip(request: Request) -> str:
    """Tras proxy inverso (uvicorn --proxy-headers) request.client ya refleja X-Forwarded-For de proxies de confianza."""
    return request.client.host if request.client else "unknown"


auth_limiter = RateLimiter(window_seconds=60, max_hits=10)
payment_limiter = RateLimiter(window_seconds=3600, max_hits=5)
