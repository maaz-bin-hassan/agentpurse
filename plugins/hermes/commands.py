"""Slash commands: /purse budget, /purse receipts, /purse kill, /purse resume."""

from __future__ import annotations

from .client import McpError
from .ledger import killed, spent_cents
from .money import as_cents, format_cents
from .service import cancel_open_watches, chat_id, open_client, public_error, read_config, set_kill

HELP = (
    "Usage: /purse budget | receipts | kill | resume\n"
    "budget shows the AgentPurse allowance and this chat's Hermes spend.\n"
    "receipts lists PayPal sandbox receipts. A receipt is not a retailer order.\n"
    "kill refuses new purchases and cancels open price watches.\n"
    "resume turns the kill switch off. The next purchase still waits for approval."
)


def handle(ctx, raw_args: str, **kwargs) -> str:
    try:
        return _handle(ctx, raw_args if isinstance(raw_args, str) else "", **kwargs)
    except Exception as exc:
        return f"AgentPurse command failed: {public_error(exc)}"


def _handle(ctx, raw_args: str, **kwargs) -> str:
    command = (raw_args.strip().split() or ["help"])[0].lower()
    if command in {"help", ""}:
        return HELP
    if command == "kill":
        return _kill(ctx)
    if command == "resume":
        set_kill(ctx.state, False)
        return "Kill switch is off. The next purchase still waits for your approval. Nothing is sent automatically."
    if command == "budget":
        return _budget(ctx, kwargs)
    if command == "receipts":
        return _receipts(ctx)
    return HELP


def _kill(ctx) -> str:
    set_kill(ctx.state, True)
    try:
        client = open_client(ctx, hook=False)
        cancelled, failed = cancel_open_watches(client)
    except McpError as exc:
        return (
            "Kill switch is on. New purchases and new price watches will be refused. "
            f"Open watches were not cancelled: {public_error(exc)}"
        )
    lines = ["Kill switch is on. The next purchase will be refused."]
    if cancelled:
        lines.append("Cancelled watches: " + ", ".join(cancelled))
    elif not failed:
        lines.append("No open price watches.")
    if failed:
        lines.append("Could not cancel: " + ", ".join(failed))
    return " ".join(lines)


def _budget(ctx, kwargs: dict) -> str:
    config = read_config(ctx)
    chat = chat_id(str(kwargs.get("task_id") or ""), str(kwargs.get("session_id") or ""))
    spent = spent_cents(ctx.state, chat)
    spent_line = "unreadable" if spent is None else f"{format_cents(spent)} ({spent} cents)"
    switch = "on" if killed(ctx.state) else "off"
    try:
        rows = open_client(ctx, hook=False).call_tool("get_budget", {})
    except McpError as exc:
        return (
            f"Kill switch: {switch}. This chat has spent {spent_line} of {format_cents(config.spend_limit_cents)}. "
            f"Could not read AgentPurse: {public_error(exc)}"
        )
    if not isinstance(rows, list) or not rows:
        return f"Kill switch: {switch}. AgentPurse returned no allowance. This chat has spent {spent_line}."
    lines = [f"Kill switch: {switch}. Hermes limit for this chat: {format_cents(config.spend_limit_cents)}. Spent here: {spent_line}."]
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("name") if isinstance(row.get("name"), str) else "Agent"
        remaining = row.get("remainingCents")
        allowance = row.get("allowanceCents")
        if isinstance(remaining, bool) or not isinstance(remaining, int):
            lines.append(f"{name}: allowance unreadable.")
            continue
        allowance_text = format_cents(allowance) if isinstance(allowance, int) and not isinstance(allowance, bool) else "an unknown allowance"
        lines.append(f"{name}: {format_cents(remaining)} left of {allowance_text} ({remaining} cents).")
    lines.append("Sandbox money only. No retailer order is placed by a receipt.")
    return " ".join(lines)


def _receipts(ctx) -> str:
    try:
        rows = open_client(ctx, hook=False).call_tool("list_receipts", {})
    except McpError as exc:
        return f"Could not read receipts: {public_error(exc)}"
    if not isinstance(rows, list) or not rows:
        return "No PayPal receipts yet. A receipt would be sandbox money, not a retailer order."
    lines = ["PayPal sandbox receipts. None of these is a retailer order."]
    for row in rows[:8]:
        if not isinstance(row, dict):
            continue
        amount = as_cents(row.get("amountCents"))
        amount_text = format_cents(amount) if amount is not None else "an unreadable amount"
        merchant = row.get("merchantName") if isinstance(row.get("merchantName"), str) else "Merchant"
        kind = row.get("kind") if isinstance(row.get("kind"), str) else "receipt"
        order = row.get("paypalOrderId") if isinstance(row.get("paypalOrderId"), str) else ""
        order_text = f" order {order}" if order else ""
        lines.append(f"{kind}: {merchant} {amount_text}{order_text}.")
    if len(rows) > 8:
        lines.append(f"{len(rows) - 8} older receipts not shown.")
    return " ".join(lines)
