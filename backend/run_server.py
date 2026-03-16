from __future__ import annotations

import os

import uvicorn


def resolve_port() -> int:
    raw_value = os.getenv("PORT", "8080").strip()
    try:
        port = int(raw_value)
    except (TypeError, ValueError):
        port = 8080
    return max(1, min(65535, port))


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0").strip() or "0.0.0.0",
        port=resolve_port(),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
