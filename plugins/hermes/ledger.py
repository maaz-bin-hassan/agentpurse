"""Per-profile purse state: kill switch, quote cache, and the per-chat spend ledger.

Values live in the plugin state Hermes gives ``register(ctx)``. Nothing here
is written into the plugin directory.
"""

from __future__ import annotations

import json
from typing import Protocol

from .money import as_cents

QUOTES = "quotes"
MERCHANTS = "merchants"
SESSIONS = "sessions"
KILLED = "killed"
GRANTS = "approval_grants"
MAX_GRANTS = 8
MAX_QUOTES = 40
MAX_PURCHASES = 20
GRANT_TTL_S = 600


class State(Protocol):
    def get(self, key: str, default=None): ...

    def set(self, key: str, value) -> None: ...


def _load(state: State, key: str, default):
    value = state.get(key, default)
    if value is None:
        return json.loads(json.dumps(default))
    return json.loads(json.dumps(value))


def killed(state: State) -> bool:
    return state.get(KILLED, False) is True


def set_killed(state: State, value: bool) -> None:
    state.set(KILLED, value is True)


def remember_merchants(state: State, rows: list) -> None:
    current = _load(state, MERCHANTS, {})
    if not isinstance(current, dict):
        current = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        current[name.strip().casefold()] = {
            "name": name.strip(),
            "blocked": row.get("blocked") is True,
            "trusted": row.get("trusted") is True,
            "category": row.get("category") if isinstance(row.get("category"), str) else "",
        }
    state.set(MERCHANTS, current)


def merchant(state: State, name: str) -> dict | None:
    current = _load(state, MERCHANTS, {})
    if not isinstance(current, dict):
        return None
    row = current.get(name.strip().casefold())
    return row if isinstance(row, dict) else None


def remember_quote(state: State, quote: dict) -> None:
    quotes = _load(state, QUOTES, {})
    if not isinstance(quotes, dict):
        quotes = {}
    quotes[quote["quote_id"]] = quote
    if len(quotes) > MAX_QUOTES:
        ordered = sorted(quotes.items(), key=lambda item: item[1].get("stored_at", 0) if isinstance(item[1], dict) else 0)
        quotes = dict(ordered[-MAX_QUOTES:])
    state.set(QUOTES, quotes)


def get_quote(state: State, quote_id: str) -> dict | None:
    quotes = _load(state, QUOTES, {})
    if not isinstance(quotes, dict):
        return None
    row = quotes.get(quote_id)
    return row if isinstance(row, dict) else None


def spent_cents(state: State, session_id: str) -> int | None:
    sessions = _load(state, SESSIONS, {})
    if not isinstance(sessions, dict):
        return None
    row = sessions.get(session_id)
    if row is None:
        return 0
    if not isinstance(row, dict):
        return None
    spent = as_cents(row.get("spent_cents", 0))
    if spent is None or spent < 0:
        return None
    return spent


def record_purchase(
    state: State,
    session_id: str,
    *,
    amount_cents: int,
    merchant_name: str,
    intent_id: str,
    order_id: str | None,
) -> int | None:
    amount = as_cents(amount_cents, positive=True)
    if amount is None or not intent_id:
        return None
    sessions = _load(state, SESSIONS, {})
    if not isinstance(sessions, dict):
        sessions = {}
    row = sessions.get(session_id)
    if not isinstance(row, dict):
        row = {"spent_cents": 0, "purchases": []}
    purchases = [item for item in row.get("purchases") or [] if isinstance(item, dict)]
    if any(item.get("intent_id") == intent_id for item in purchases):
        spent = as_cents(row.get("spent_cents", 0))
        return spent if spent is not None and spent >= 0 else None
    spent = as_cents(row.get("spent_cents", 0))
    if spent is None or spent < 0:
        return None
    purchases.append({
        "intent_id": intent_id,
        "merchant": merchant_name,
        "amount_cents": amount,
        "order_id": order_id,
    })
    updated = spent + amount
    sessions[session_id] = {"spent_cents": updated, "purchases": purchases[-MAX_PURCHASES:]}
    state.set(SESSIONS, sessions)
    return updated



def _grants(state: State) -> dict:
    grants = _load(state, GRANTS, {})
    return grants if isinstance(grants, dict) else {}


def _fresh(row: dict, now: float) -> bool:
    issued = row.get("issued_at")
    if isinstance(issued, bool) or not isinstance(issued, (int, float)):
        return False
    return now - float(issued) <= GRANT_TTL_S


def issue_grant(state: State, rule_key: str, grant: dict, *, now: float) -> None:
    """Store a proposed grant. It cannot spend until Hermes reports that a person approved it."""
    grants = {key: row for key, row in _grants(state).items() if isinstance(row, dict) and _fresh(row, now)}
    grants[rule_key] = {**grant, "human": False}
    if len(grants) > MAX_GRANTS:
        ordered = sorted(grants.items(), key=lambda item: item[1].get("issued_at", 0))
        grants = dict(ordered[-MAX_GRANTS:])
    state.set(GRANTS, grants)


def mark_human(state: State, rule_key: str, choice: str) -> bool:
    """Record that a person answered Hermes' prompt for this grant with an approval."""
    grants = _grants(state)
    row = grants.get(rule_key)
    if not isinstance(row, dict):
        return False
    grants[rule_key] = {**row, "human": True, "choice": choice}
    state.set(GRANTS, grants)
    return True


def drop_grant(state: State, rule_key: str) -> None:
    grants = _grants(state)
    if rule_key in grants:
        grants.pop(rule_key)
        state.set(GRANTS, grants)


def clear_grants(state: State) -> None:
    state.set(GRANTS, {})


def take_grant(
    state: State,
    *,
    fingerprint: str,
    session_id: str,
    tool_name: str,
    tool_call_id: str,
    now: float,
) -> tuple[dict | None, str]:
    """Consume the one-time grant. A missing, mismatched, or machine-approved grant never spends."""
    grants = _grants(state)
    match_key = ""
    for key, row in grants.items():
        if not isinstance(row, dict):
            continue
        if row.get("fingerprint") != fingerprint or row.get("session_id") != session_id or row.get("tool_name") != tool_name:
            continue
        granted_call = row.get("tool_call_id") if isinstance(row.get("tool_call_id"), str) else ""
        if granted_call and tool_call_id and granted_call != tool_call_id:
            continue
        if not match_key or row.get("human") is True:
            match_key = key
    if not match_key:
        return None, "Hermes did not approve this payment, so it was not sent."
    grant = grants.pop(match_key)
    state.set(GRANTS, grants)
    if grant.get("human") is not True:
        return None, (
            "Hermes let this payment through without asking a person (YOLO, approvals off, smart approval, "
            "a saved rule, or an unattended auto-approve). AgentPurse spends only after you approve the "
            "prompt yourself, so it was not sent."
        )
    if not _fresh(grant, now):
        return None, "The approval expired before the payment was sent. Ask again."
    amount = as_cents(grant.get("amount_cents"), positive=True)
    merchant_name = grant.get("merchant")
    if amount is None or not isinstance(merchant_name, str) or not merchant_name.strip():
        return None, "The approval did not name a merchant and an amount, so the payment was not sent."
    return grant, ""
