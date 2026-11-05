"""The purchase gate. Pure: no network, no prompt, no approval of its own.

``approve`` asks Hermes to show its approval prompt. ``block`` refuses.
There is no third result for a purchase tool.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .money import format_cents

GOVERNED = frozenset({"request_purchase", "watch_price"})


@dataclass(frozen=True)
class Preview:
    merchant: str
    amount_cents: int
    guard: str
    guard_detail: str
    remaining_cents: int
    quote_id: str
    description: str
    fingerprint: str
    merchant_blocked: bool


def rule_key(fingerprint: str) -> str:
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]
    return f"agentpurse:{digest}"


def decide(
    *,
    tool_name: str,
    killed: bool,
    attended: bool,
    unattended_reason: str,
    preview: Preview | None,
    preview_error: str,
    spent_cents: int | None,
    spend_limit_cents: int,
) -> dict | None:
    if tool_name not in GOVERNED:
        return None
    if killed:
        return _block("The AgentPurse kill switch is on. /purse resume turns it off. This payment was not sent.")
    if not attended:
        return _block(unattended_reason or "No approver is available. The payment was not sent.")
    if preview_error or preview is None:
        return _block(preview_error or "AgentPurse could not prepare this payment, so it was not sent.")
    if preview.merchant_blocked:
        return _block(f"{preview.merchant} is blocked. The payment was not sent.")
    if preview.guard == "block":
        detail = f" {preview.guard_detail}" if preview.guard_detail else ""
        return _block(f"The intent guard blocked this purchase.{detail} It was not sent.")
    if preview.guard not in {"pass", "pending"}:
        return _block("The quote has no guard verdict, so the payment was not sent.")
    if spent_cents is None:
        return _block("The local spend ledger is unreadable, so the payment was not sent.")
    if spend_limit_cents < 0:
        return _block("The per-chat spend limit is not a usable number of cents, so the payment was not sent.")
    if preview.amount_cents > preview.remaining_cents:
        return _block(
            f"{format_cents(preview.amount_cents)} is over the {format_cents(preview.remaining_cents)} "
            "left in this AgentPurse allowance. The payment was not sent."
        )
    projected = spent_cents + preview.amount_cents
    if projected > spend_limit_cents:
        return _block(
            f"This chat has spent {format_cents(spent_cents)} of its {format_cents(spend_limit_cents)} Hermes limit. "
            f"{format_cents(preview.amount_cents)} more would pass it. The payment was not sent."
        )
    return {
        "action": "approve",
        "message": _prompt(tool_name, preview, spent_cents, projected, spend_limit_cents),
        "rule_key": rule_key(preview.fingerprint),
    }


def _prompt(tool_name: str, preview: Preview, spent: int, projected: int, limit: int) -> str:
    guard = "pass" if preview.guard == "pass" else "the clerk has not seen this sentence yet"
    if preview.guard == "pass" and preview.guard_detail:
        guard = f"pass ({preview.guard_detail})"
    lines = [
        "AgentPurse needs your approval before any money moves.",
        f"Merchant: {preview.merchant}",
        f"Amount: {format_cents(preview.amount_cents)} ({preview.amount_cents} cents)",
        f"Remaining AgentPurse allowance: {format_cents(preview.remaining_cents)} ({preview.remaining_cents} cents)",
        f"Guard: {guard}",
        f"This chat after this payment: {format_cents(projected)} of {format_cents(limit)} ({spent} cents spent before)",
    ]
    if preview.quote_id:
        lines.append(f"Quote: {preview.quote_id}")
    if preview.description:
        lines.append(f"Description: {preview.description[:180]}")
    if tool_name == "watch_price":
        lines.append(
            "This creates a price watch. It does not capture now. If the price hits the target, "
            "AgentPurse files a normal purchase and the clerk still decides. Hermes will not show a second prompt for that later purchase. "
            "/purse kill cancels open watches."
        )
    else:
        lines.append("Approving lets the clerk allow, hold for a passkey, or deny. It does not place a retailer order.")
    lines.append("PayPal sandbox only. Denying sends nothing.")
    return "\n".join(lines)


def _block(message: str) -> dict:
    return {"action": "block", "message": message}
