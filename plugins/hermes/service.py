"""Connect the gate, the ledger, and the AgentPurse MCP.

Tool handlers and the pre-tool hook both come through here. A purchase is
sent only when the hook has left a one-time grant for that exact merchant
and amount. The handler never approves on its own.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
from dataclasses import dataclass

from .attendance import classify, current_argv, session_env
from .client import McpClient, McpError, normalize_base_url
from .gate import GOVERNED, Preview, decide
from .ledger import (
    clear_grant,
    get_quote,
    issue_grant,
    killed as kill_flag,
    merchant as cached_merchant,
    record_purchase,
    remember_merchants,
    remember_quote,
    set_killed,
    spent_cents,
    take_grant,
)
from .money import as_cents, format_cents
from .polling import poll_until_settled
from .secrets import read_api_key, redact

_AMOUNT = re.compile(r"\$(\d{1,7})(?:\.(\d{1,2}))?")
_FROM = re.compile(r"\bfrom\s+(.+?)\s+for\b", re.IGNORECASE)
DEFAULT_BASE = "https://agentpurse.vercel.app"
DEFAULT_LIMIT = 5000
DEFAULT_TIMEOUT = 120
HOOK_TIMEOUT_S = 8.0
TOOL_TIMEOUT_S = 20.0


@dataclass(frozen=True)
class Config:
    base_url: str
    spend_limit_cents: int
    approval_timeout_s: int


def _config_int(value: object, default: int) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value if value >= 0 else 0
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return default if value is None else 0


def config_from(values: dict | None) -> Config:
    values = values or {}
    base = values.get("base_url", DEFAULT_BASE)
    if not isinstance(base, str) or not base.strip():
        base = DEFAULT_BASE
    limit = _config_int(values.get("spend_limit_cents", DEFAULT_LIMIT), 0)
    timeout = _config_int(values.get("approval_timeout_s", DEFAULT_TIMEOUT), 0)
    return Config(base_url=base.strip(), spend_limit_cents=limit, approval_timeout_s=timeout)


def read_config(ctx) -> Config:
    if ctx is None:
        return config_from({})
    try:
        return config_from({
            "base_url": ctx.get_config("base_url", default=DEFAULT_BASE),
            "spend_limit_cents": ctx.get_config("spend_limit_cents", default=DEFAULT_LIMIT),
            "approval_timeout_s": ctx.get_config("approval_timeout_s", default=DEFAULT_TIMEOUT),
        })
    except Exception:
        return config_from({"spend_limit_cents": 0, "approval_timeout_s": 0})


def chat_id(task_id: str, session_id: str) -> str:
    chosen = (session_id or task_id or "chat").strip()
    return chosen[:200] or "chat"


def fingerprint(tool_name: str, args: dict, merchant_name: str, amount_cents: int) -> str:
    payload = {
        "tool": tool_name,
        "quoteId": _text(args.get("quoteId")),
        "text": _text(args.get("text")),
        "productId": _text(args.get("productId")),
        "domain": _text(args.get("domain")),
        "targetCents": args.get("targetCents") if isinstance(args.get("targetCents"), int) and not isinstance(args.get("targetCents"), bool) else "",
        "originalTask": _text(args.get("originalTask")),
        "merchant": merchant_name,
        "amount_cents": amount_cents,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def parse_payment_sentence(text: str) -> tuple[str, int] | None:
    amount = _AMOUNT.search(text)
    merchant_match = _FROM.search(text)
    if not amount or not merchant_match:
        return None
    dollars = int(amount.group(1))
    fraction = (amount.group(2) or "").ljust(2, "0")
    cents = dollars * 100 + int(fraction)
    if cents <= 0 or cents > 100_000_000:
        return None
    name = merchant_match.group(1).strip()
    if not name or len(name) > 80:
        return None
    return name, cents


def guard_parts(value) -> tuple[str, str]:
    if isinstance(value, str):
        decision = value.strip().lower()
        return (decision if decision in {"pass", "block"} else "unknown", "")
    if isinstance(value, dict):
        decision = str(value.get("decision") or "").strip().lower()
        reasons = value.get("reasons") or []
        sentences: list[str] = []
        if isinstance(reasons, list):
            for reason in reasons:
                if isinstance(reason, dict) and isinstance(reason.get("sentence"), str):
                    sentences.append(reason["sentence"])
                elif isinstance(reason, str):
                    sentences.append(reason)
        if decision not in {"pass", "block"}:
            decision = "unknown"
        return decision, " ".join(sentences)[:400]
    return "unknown", ""


def quote_from_payload(payload: dict, now: float) -> dict | None:
    quote_id = payload.get("quoteId")
    amount = as_cents(payload.get("amountCents"), positive=True)
    merchant_name = payload.get("merchant")
    if not isinstance(quote_id, str) or not quote_id or amount is None:
        return None
    if not isinstance(merchant_name, str) or not merchant_name.strip():
        return None
    decision, detail = guard_parts(payload.get("guard"))
    description = payload.get("description") if isinstance(payload.get("description"), str) else ""
    if not description and isinstance(payload.get("product"), str):
        description = payload["product"]
    return {
        "quote_id": quote_id,
        "merchant": merchant_name.strip(),
        "amount_cents": amount,
        "guard": decision,
        "guard_detail": detail,
        "description": description[:180],
        "stored_at": now,
    }


def make_client(config: Config, api_key: str, *, hook: bool, transport=None, sleep=None) -> McpClient:
    return McpClient(
        config.base_url,
        api_key,
        timeout_s=HOOK_TIMEOUT_S if hook else TOOL_TIMEOUT_S,
        read_attempts=1 if hook else 3,
        transport=transport,
        sleep=sleep,
    )


def open_client(ctx, *, hook: bool, key_getter=None, transport=None, sleep=None) -> McpClient:
    config = read_config(ctx)
    try:
        normalize_base_url(config.base_url)
    except McpError:
        raise
    key = read_api_key(key_getter)
    if not key:
        raise McpError("AGENTPURSE_API_KEY is not set in Hermes' secret scope.")
    return make_client(config, key, hook=hook, transport=transport, sleep=sleep)


def on_pre_tool(
    ctx,
    tool_name: str,
    args: dict,
    *,
    task_id: str,
    session_id: str,
    tool_call_id: str = "",
    env: dict | None = None,
    argv: list[str] | None = None,
    client=None,
    now: float | None = None,
) -> dict | None:
    if tool_name not in GOVERNED:
        return None
    state = ctx.state
    config = read_config(ctx)
    attended, reason = classify(env if env is not None else session_env(), argv=current_argv() if argv is None else argv)
    clock = now if now is not None else time.time()
    chat = chat_id(task_id, session_id)
    if kill_flag(state) or not attended:
        clear_grant(state)
        return decide(
            tool_name=tool_name,
            killed=kill_flag(state),
            attended=attended,
            unattended_reason=reason,
            preview=None,
            preview_error="",
            spent_cents=0,
            spend_limit_cents=config.spend_limit_cents,
        )
    try:
        active = client or open_client(ctx, hook=True)
        preview, error = resolve_preview(active, state, tool_name, args, now=clock)
    except McpError as exc:
        preview, error = None, redact(str(exc))
    except Exception as exc:
        preview, error = None, public_error(exc)
    directive = decide(
        tool_name=tool_name,
        killed=False,
        attended=True,
        unattended_reason="",
        preview=preview,
        preview_error=error,
        spent_cents=spent_cents(state, chat),
        spend_limit_cents=config.spend_limit_cents,
    )
    if directive and directive.get("action") == "approve" and preview is not None:
        issue_grant(state, {
            "fingerprint": preview.fingerprint,
            "session_id": chat,
            "tool_name": tool_name,
            "tool_call_id": tool_call_id,
            "amount_cents": preview.amount_cents,
            "merchant": preview.merchant,
            "quote_id": preview.quote_id,
            "issued_at": clock,
        })
    else:
        clear_grant(state)
    return directive


def invoke_tool(ctx, name: str, args: dict, *, task_id: str = "", session_id: str = "", tool_call_id: str = "", env: dict | None = None, argv: list[str] | None = None, client=None, now: float | None = None) -> object:
    if not isinstance(args, dict):
        args = {}
    if name in GOVERNED:
        return perform_governed(
            ctx, name, args,
            task_id=task_id, session_id=session_id, tool_call_id=tool_call_id,
            env=env, argv=argv, client=client, now=now,
        )
    active = client or open_client(ctx, hook=False)
    result = active.call_tool(name, args)
    if name == "get_quote" and isinstance(result, dict):
        quote = quote_from_payload(result, now if now is not None else time.time())
        if quote:
            remember_quote(ctx.state, quote)
    if name == "search_merchants" and isinstance(result, list):
        remember_merchants(ctx.state, result)
    return result


def perform_governed(ctx, tool_name: str, args: dict, *, task_id: str, session_id: str, tool_call_id: str = "", env: dict | None, argv: list[str] | None, client=None, now: float | None = None, sleeper=None, monotonic_fn=None) -> dict:
    """Send a purchase only after a matching grant. Re-check the hard blocks first."""
    state = ctx.state
    config = read_config(ctx)
    clock = now if now is not None else time.time()
    chat = chat_id(task_id, session_id)
    attended, reason = classify(env if env is not None else session_env(), argv=current_argv() if argv is None else argv)
    if kill_flag(state) or not attended:
        clear_grant(state)
        directive = decide(
            tool_name=tool_name,
            killed=kill_flag(state),
            attended=attended,
            unattended_reason=reason,
            preview=None,
            preview_error="",
            spent_cents=0,
            spend_limit_cents=config.spend_limit_cents,
        )
        return {"ok": False, "error": (directive or {}).get("message", "The payment was not sent."), "sent": False}
    active = client or open_client(ctx, hook=False)
    preview, error = resolve_preview(active, state, tool_name, args, now=clock)
    if error or preview is None:
        clear_grant(state)
        return {"ok": False, "error": error or "The payment was not sent.", "sent": False}
    directive = decide(
        tool_name=tool_name,
        killed=False,
        attended=True,
        unattended_reason="",
        preview=preview,
        preview_error="",
        spent_cents=spent_cents(state, chat),
        spend_limit_cents=config.spend_limit_cents,
    )
    if not directive or directive.get("action") != "approve":
        clear_grant(state)
        return {"ok": False, "error": (directive or {}).get("message", "The payment was not sent."), "sent": False}
    grant, grant_error = take_grant(
        state,
        fingerprint=preview.fingerprint,
        session_id=chat,
        tool_name=tool_name,
        tool_call_id=tool_call_id,
        now=clock,
    )
    if grant is None:
        return {"ok": False, "error": grant_error, "sent": False}
    blocked = _merchant_block(active, state, preview.merchant)
    if blocked:
        return {"ok": False, "error": blocked, "sent": False}
    if tool_name == "watch_price":
        result = active.call_tool("watch_price", args)
        return result if isinstance(result, dict) else {"ok": True, "result": result}
    result = active.call_tool("request_purchase", _purchase_args(args))
    if not isinstance(result, dict):
        return {"ok": False, "error": "AgentPurse returned a purchase result that was not an object.", "sent": True}
    _note_capture(state, chat, result)
    status = _intent_status(result)
    if status not in {"pending_approval", "awaiting_paypal"}:
        result = dict(result)
        result["hermes"] = _hermes_note(state, chat, config, settled=status)
        return result
    if not attended:
        return _hold_result(result, config, timed_out=False, stopped="No approver is available to wait for this signature.")
    outcome = _poll_hold(active, state, config, result, sleeper=sleeper, monotonic_fn=monotonic_fn)
    if _intent_status(outcome) == "captured":
        _note_capture(state, chat, outcome)
    outcome["hermes"] = _hermes_note(state, chat, config, settled=_intent_status(outcome))
    return outcome


def resolve_preview(client: McpClient, state, tool_name: str, args: dict, *, now: float) -> tuple[Preview | None, str]:
    try:
        if tool_name == "watch_price":
            return _watch_preview(client, state, args), ""
        return _purchase_preview(client, state, args), ""
    except McpError as exc:
        return None, redact(str(exc))


def dashboard_url(base_url: str, owner_id: str, intent_id: str) -> str:
    owner = urllib.parse.quote(owner_id, safe="")
    hold = urllib.parse.quote(intent_id, safe="")
    return f"{normalize_base_url(base_url)}/purses/{owner}?hold={hold}"


def cancel_open_watches(client: McpClient) -> tuple[list[str], list[str]]:
    cancelled: list[str] = []
    failed: list[str] = []
    rows = client.call_tool("list_watches", {})
    if not isinstance(rows, list):
        return cancelled, failed
    for row in rows:
        if not isinstance(row, dict) or row.get("status") != "watching":
            continue
        watch_id = row.get("id")
        if not isinstance(watch_id, str) or not watch_id:
            continue
        try:
            client.call_tool("cancel_watch", {"watchId": watch_id})
            cancelled.append(watch_id)
        except McpError:
            failed.append(watch_id)
    return cancelled, failed


def _purchase_preview(client, state, args: dict) -> Preview:
    quote_id = _text(args.get("quoteId"))
    if quote_id:
        cached = get_quote(state, quote_id)
        if not cached:
            raise McpError("Unknown quote. Call get_quote first so the approval prompt can show the merchant, the amount, and the guard verdict.")
        merchant_name = str(cached.get("merchant") or "")
        amount = as_cents(cached.get("amount_cents"), positive=True)
        guard = str(cached.get("guard") or "unknown")
        detail = str(cached.get("guard_detail") or "")
        description = str(cached.get("description") or "")
        if amount is None or not merchant_name:
            raise McpError("The stored quote is missing a merchant or an amount in cents.")
    else:
        parsed = parse_payment_sentence(_text(args.get("text")))
        if not parsed:
            raise McpError("Call get_quote first. Hermes needs a merchant and a dollar amount before it can ask you to approve.")
        merchant_name, amount = parsed
        guard = "pending"
        detail = ""
        description = _text(args.get("text"))[:180]
        quote_id = ""
    blocked = _blocked(client, state, merchant_name)
    remaining = _remaining(client)
    return Preview(
        merchant=merchant_name,
        amount_cents=amount,
        guard=guard,
        guard_detail=detail,
        remaining_cents=remaining,
        quote_id=quote_id,
        description=description,
        fingerprint=fingerprint("request_purchase", args, merchant_name, amount),
        merchant_blocked=blocked,
    )


def _watch_preview(client, state, args: dict) -> Preview:
    domain = _text(args.get("domain"))
    product_id = _text(args.get("productId"))
    target = as_cents(args.get("targetCents"), positive=True)
    task = _text(args.get("originalTask"))
    if not domain or not product_id or target is None or not task:
        raise McpError("A price watch needs productId, domain, targetCents, and originalTask.")
    blocked = _blocked(client, state, domain)
    remaining = _remaining(client)
    return Preview(
        merchant=domain,
        amount_cents=target,
        guard="pending",
        guard_detail="",
        remaining_cents=remaining,
        quote_id="",
        description=task[:180],
        fingerprint=fingerprint("watch_price", args, domain, target),
        merchant_blocked=blocked,
    )


def _blocked(client: McpClient, state, name: str) -> bool:
    try:
        rows = client.call_tool("search_merchants", {"query": name})
    except McpError:
        cached = cached_merchant(state, name)
        if cached is None:
            raise
        return cached.get("blocked") is True
    if isinstance(rows, list):
        remember_merchants(state, rows)
        exact = _exact(rows, name)
        if exact is not None:
            return exact.get("blocked") is True
    cached = cached_merchant(state, name)
    if cached is not None:
        return cached.get("blocked") is True
    return False


def _merchant_block(client, state, name: str) -> str:
    try:
        blocked = _blocked(client, state, name)
    except McpError:
        cached = cached_merchant(state, name)
        if cached is None:
            return "Could not re-check the merchant, so the payment was not sent."
        blocked = cached.get("blocked") is True
    if blocked:
        return f"{name} is blocked. The payment was not sent."
    return ""


def _remaining(client: McpClient) -> int:
    rows = client.call_tool("get_budget", {})
    if not isinstance(rows, list) or not rows:
        raise McpError("AgentPurse did not return a budget.")
    cents: list[int] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = row.get("remainingCents")
        if isinstance(value, bool) or not isinstance(value, int):
            continue
        if value > 100_000_000 or value < -100_000_000:
            continue
        cents.append(value)
    if not cents:
        raise McpError("AgentPurse budget had no remaining cents.")
    return min(cents)


def _exact(rows: list, name: str) -> dict | None:
    folded = name.strip().casefold()
    for row in rows:
        if isinstance(row, dict) and isinstance(row.get("name"), str) and row["name"].strip().casefold() == folded:
            return row
    return None


def _purchase_args(args: dict) -> dict:
    sent = {}
    for key in ("quoteId", "text", "originalTask", "pageExcerpt"):
        if isinstance(args.get(key), str) and args[key]:
            sent[key] = args[key]
    return sent


def _intent(result: dict) -> dict:
    intent = result.get("intent")
    return intent if isinstance(intent, dict) else {}


def _intent_status(result: dict) -> str:
    status = _intent(result).get("status")
    return status if isinstance(status, str) else ""


def _note_capture(state, chat: str, result: dict) -> None:
    if _intent_status(result) != "captured":
        return
    intent = _intent(result)
    amount = as_cents(intent.get("amountCents"), positive=True)
    intent_id = intent.get("id") if isinstance(intent.get("id"), str) else ""
    merchant_name = intent.get("merchantName") if isinstance(intent.get("merchantName"), str) else ""
    order = result.get("order")
    order_id = order.get("id") if isinstance(order, dict) and isinstance(order.get("id"), str) else None
    if amount is None or not intent_id:
        return
    record_purchase(state, chat, amount_cents=amount, merchant_name=merchant_name, intent_id=intent_id, order_id=order_id)


def _poll_hold(client: McpClient, state, config: Config, result: dict, *, sleeper=None, monotonic_fn=None) -> dict:
    intent = _intent(result)
    intent_id = intent.get("id") if isinstance(intent.get("id"), str) else ""
    owner_id = intent.get("ownerId") if isinstance(intent.get("ownerId"), str) else ""
    fallback = ""
    if intent_id and owner_id:
        try:
            fallback = dashboard_url(config.base_url, owner_id, intent_id)
        except McpError:
            fallback = ""

    def fetch() -> dict:
        try:
            return client.get_spend(intent_id)
        except McpError as exc:
            if exc.status == 404:
                raise
            raise

    try:
        outcome = poll_until_settled(
            fetch,
            timeout_s=float(config.approval_timeout_s),
            interval_s=2.0,
            sleep=sleeper or time.sleep,
            monotonic=monotonic_fn or time.monotonic,
            stop=lambda: "The kill switch came on while waiting." if kill_flag(state) else "",
        )
    except McpError as exc:
        if exc.status == 404:
            return _hold_result(result, config, timed_out=False, stopped="", approval_url=fallback, polling="unavailable")
        return _hold_result(result, config, timed_out=False, stopped=redact(str(exc)), approval_url=fallback)
    approval_url = outcome.get("approvalUrl") if isinstance(outcome.get("approvalUrl"), str) else fallback
    if outcome.get("timed_out") or outcome.get("stopped"):
        return _hold_result(
            result,
            config,
            timed_out=bool(outcome.get("timed_out")),
            stopped=str(outcome.get("stopped") or ""),
            approval_url=approval_url,
            latest=outcome.get("intent") if isinstance(outcome.get("intent"), dict) else None,
        )
    merged = dict(result)
    if isinstance(outcome.get("intent"), dict):
        merged["intent"] = outcome["intent"]
        merged["ok"] = outcome["intent"].get("status") == "captured"
    merged["approvalUrl"] = approval_url
    merged["timedOut"] = False
    return merged


def _hold_result(result: dict, config: Config, *, timed_out: bool, stopped: str, approval_url: str = "", polling: str = "", latest: dict | None = None) -> dict:
    intent = latest or _intent(result)
    owner_id = intent.get("ownerId") if isinstance(intent.get("ownerId"), str) else _intent(result).get("ownerId")
    intent_id = intent.get("id") if isinstance(intent.get("id"), str) else ""
    url = approval_url
    if not url and isinstance(owner_id, str) and intent_id:
        try:
            url = dashboard_url(config.base_url, owner_id, intent_id)
        except McpError:
            url = ""
    message = "AgentPurse is holding this cheque for a signature."
    if timed_out:
        message = "The signature wait ended. The cheque is still holding. Open the approval URL, then ask again to read the result."
    elif stopped:
        message = stopped
    elif polling == "unavailable":
        message = "AgentPurse is holding this cheque. This server has no status poll yet, so open the approval URL and ask again after you sign."
    return {
        "ok": False,
        "pending": True,
        "sent": True,
        "timedOut": timed_out,
        "error": message,
        "approvalUrl": url,
        "intent": intent,
        "explanation": result.get("explanation"),
        "sandbox": True,
        "retailerOrder": False,
    }


def _hermes_note(state, chat: str, config: Config, *, settled: str) -> dict:
    spent = spent_cents(state, chat)
    return {
        "chat_spent_cents": spent,
        "spend_limit_cents": config.spend_limit_cents,
        "kill_switch": kill_flag(state),
        "status": settled,
        "sandbox": True,
        "retailer_order": False,
        "note": "PayPal sandbox only. No retailer order was placed.",
        "remaining_display": format_cents(spent) if spent is not None else "",
    }


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def public_error(exc: BaseException) -> str:
    return redact(str(exc) or exc.__class__.__name__)


# Re-exported for the slash command that flips the switch without importing ledger twice.
def set_kill(state, value: bool) -> None:
    set_killed(state, value)
