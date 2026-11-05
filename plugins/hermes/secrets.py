"""Read the agent key from Hermes' secret scope.

The plugin never opens a dotenv file and never reads the process environment.
Tests pass a getter. A missing Hermes install returns no key, which the
handlers turn into a JSON error.
"""

from __future__ import annotations

from collections.abc import Callable

SECRET_NAME = "AGENTPURSE_API_KEY"
Getter = Callable[[str], object]


def read_api_key(getter: Getter | None = None) -> str | None:
    if getter is None:
        try:
            from agent.secret_scope import get_secret
        except Exception:
            return None
        getter = get_secret
    try:
        value = getter(SECRET_NAME)
    except Exception:
        return None
    if not isinstance(value, str):
        return None
    token = value.strip()
    return token or None


def redact(text: str, secret: str | None = None) -> str:
    cleaned = " ".join(text.split())
    if secret:
        cleaned = cleaned.replace(secret, "[redacted]")
    marker = "agpk_"
    while marker in cleaned:
        start = cleaned.find(marker)
        end = start + len(marker)
        while end < len(cleaned) and cleaned[end] not in " \t\"'":
            end += 1
        cleaned = f"{cleaned[:start]}[redacted]{cleaned[end:]}"
    return cleaned[:500]
