"""Who can answer an approval prompt.

Hermes will auto-approve a pre_tool_call ``approve`` directive when cron,
single-query, or unattended mode is set to approve, and it will sit on a
prompt when nobody is there. Spending does not use those paths. This check
blocks first, using the session markers Hermes documents for plugins.
"""

from __future__ import annotations

UNATTENDED_PLATFORMS = frozenset({
    "cron",
    "webhook",
    "msgraph_webhook",
    "kanban",
    "email",
})

# Surfaces that can show Hermes' own approval card.
ATTENDED_PLATFORMS = frozenset({
    "cli",
    "tui",
    "desktop",
    "local",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "irc",
    "teams",
    "google_chat",
    "feishu",
    "wecom",
    "qq",
    "line",
    "mattermost",
})

_SESSION_NAMES = (
    "HERMES_CRON_SESSION",
    "HERMES_SINGLE_QUERY_SESSION",
    "HERMES_KANBAN_TASK",
    "HERMES_KANBAN",
    "HERMES_SESSION_PLATFORM",
    "HERMES_INTERACTIVE",
    "HERMES_GATEWAY_SESSION",
    "HERMES_EXEC_ASK",
    "HERMES_YOLO",
    "HERMES_YOLO_MODE",
    "HERMES_SESSION_SOURCE",
)


def _truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def classify(env: dict[str, str], *, platform: str = "", argv: list[str] | None = None) -> tuple[bool, str]:
    """Return ``(attended, reason)``. ``attended`` is false when the run must fail closed."""
    if argv and "--yolo" in argv:
        return False, (
            "Hermes was started with --yolo, which skips approval prompts. "
            "AgentPurse will not spend that way. Start Hermes without --yolo."
        )
    if _truthy(env.get("HERMES_YOLO_MODE")) or _truthy(env.get("HERMES_YOLO")):
        return False, "YOLO is on for this session. AgentPurse will not spend without an approval prompt."
    if _truthy(env.get("HERMES_CRON_SESSION")):
        return False, "This run is a cron job. Nobody is here to approve a payment, so it was not sent."
    if _truthy(env.get("HERMES_SINGLE_QUERY_SESSION")):
        return False, "This run is single-query (-q). Nobody is here to approve a payment, so it was not sent."
    if _truthy(env.get("HERMES_KANBAN_TASK")) or _truthy(env.get("HERMES_KANBAN")):
        return False, "This run is an unattended worker. The payment was not sent."
    surface = (platform or env.get("HERMES_SESSION_PLATFORM") or env.get("HERMES_SESSION_SOURCE") or "").strip().lower()
    if surface in UNATTENDED_PLATFORMS:
        return False, f"This session is on {surface}, which cannot show an approval prompt. The payment was not sent."
    interactive = _truthy(env.get("HERMES_INTERACTIVE"))
    gateway = _truthy(env.get("HERMES_GATEWAY_SESSION"))
    ask = _truthy(env.get("HERMES_EXEC_ASK"))
    if surface in ATTENDED_PLATFORMS:
        return True, ""
    if surface == "api_server" and (ask or gateway):
        return True, ""
    if interactive or gateway or (ask and not surface):
        return True, ""
    if surface:
        return False, f"No approver is available on platform {surface}. The payment was not sent."
    return False, "No interactive approver is available for this run. The payment was not sent."


def session_env() -> dict[str, str]:
    """Read session markers through Hermes' documented session context."""
    try:
        from gateway.session_context import get_session_env
    except Exception:
        return {}
    found: dict[str, str] = {}
    for name in _SESSION_NAMES:
        try:
            value = get_session_env(name, "")
        except Exception:
            continue
        if isinstance(value, str) and value:
            found[name] = value
    return found


def current_argv() -> list[str]:
    import sys

    return list(sys.argv)
