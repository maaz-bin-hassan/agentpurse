"""Tool handlers. Each one returns a JSON string and does not raise."""

from __future__ import annotations

import json

from .service import invoke_tool, public_error

_RUNTIME: dict = {"ctx": None}


def bind(ctx) -> None:
    _RUNTIME["ctx"] = ctx


def _handler(name: str):
    def handler(args, **kwargs) -> str:
        try:
            if not isinstance(args, dict):
                args = {}
            ctx = _RUNTIME.get("ctx")
            if ctx is None:
                return json.dumps({"ok": False, "error": "AgentPurse is not registered."})
            result = invoke_tool(
                ctx,
                name,
                args,
                task_id=str(kwargs.get("task_id") or ""),
                session_id=str(kwargs.get("session_id") or ""),
                tool_call_id=str(kwargs.get("tool_call_id") or ""),
            )
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"ok": False, "error": public_error(exc)})

    return handler


HANDLERS = {name: _handler(name) for name in (
    "search_merchants",
    "search_products",
    "get_product",
    "check_price",
    "find_alternatives",
    "get_quote",
    "request_purchase",
    "watch_price",
    "list_watches",
    "cancel_watch",
    "get_budget",
    "list_receipts",
)}
