"""AgentPurse for Hermes. The clerk still decides. Hermes still asks."""

from __future__ import annotations

from pathlib import Path

from . import schemas, tools
from .commands import handle as handle_purse
from .service import on_pre_tool, public_error


def _before_tool(tool_name, args=None, task_id="", **kwargs):
    """Block or hand the purchase to Hermes' approval prompt. Never raises."""
    try:
        ctx = tools._RUNTIME.get("ctx")
        if ctx is None:
            return {"action": "block", "message": "AgentPurse is not registered, so the payment was not sent."}
        if not isinstance(args, dict):
            args = {}
        return on_pre_tool(
            ctx,
            str(tool_name or ""),
            args,
            task_id=str(task_id or ""),
            session_id=str(kwargs.get("session_id") or ""),
            tool_call_id=str(kwargs.get("tool_call_id") or ""),
        )
    except Exception as exc:
        return {"action": "block", "message": f"AgentPurse could not check this payment, so it was not sent. {public_error(exc)}"}


def register(ctx) -> None:
    tools.bind(ctx)
    for schema in schemas.TOOLS:
        ctx.register_tool(
            name=schema["name"],
            toolset="agentpurse",
            schema=schema,
            handler=tools.HANDLERS[schema["name"]],
            description=schema["description"],
        )
    ctx.register_hook("pre_tool_call", _before_tool)
    ctx.register_command(
        "purse",
        lambda raw_args, **kwargs: handle_purse(ctx, raw_args, **kwargs),
        description="AgentPurse budget, receipts, kill switch, and resume",
        args_hint="budget|receipts|kill|resume",
    )
    skill = Path(__file__).resolve().parent / "skills" / "shop" / "SKILL.md"
    register_skill = getattr(ctx, "register_skill", None)
    if skill.is_file() and callable(register_skill):
        register_skill("shop", skill)
