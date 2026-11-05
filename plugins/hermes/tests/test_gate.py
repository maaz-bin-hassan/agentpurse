"""Purchase gate: approve, block, spend-limit math, kill switch, unattended."""

from support import ATTENDED, load

gate = load("gate")
attendance = load("attendance")
money = load("money")

Preview = gate.Preview


def preview(**overrides):
    base = dict(
        merchant="Green Grocer",
        amount_cents=255,
        guard="pass",
        guard_detail="",
        remaining_cents=8000,
        quote_id="quote_oats",
        description="oat milk",
        fingerprint="fp-oats",
        merchant_blocked=False,
    )
    base.update(overrides)
    return Preview(**base)


def decide(**overrides):
    base = dict(
        tool_name="request_purchase",
        killed=False,
        attended=True,
        unattended_reason="",
        preview=preview(),
        preview_error="",
        spent_cents=0,
        spend_limit_cents=5000,
    )
    base.update(overrides)
    return gate.decide(**base)


def test_approve_names_merchant_amount_budget_and_guard():
    directive = decide()
    assert directive["action"] == "approve"
    message = directive["message"]
    assert "Green Grocer" in message
    assert "$2.55" in message
    assert "255 cents" in message
    assert "$80.00" in message
    assert "8000 cents" in message
    assert "Guard: pass" in message
    assert "quote_oats" in message
    assert directive["rule_key"].startswith("agentpurse:")


def test_kill_switch_blocks_before_a_prompt():
    directive = decide(killed=True)
    assert directive["action"] == "block"
    assert "kill switch" in directive["message"].lower()


def test_spend_limit_boundary():
    assert decide(spent_cents=4745)["action"] == "approve"
    blocked = decide(spent_cents=4746)
    assert blocked["action"] == "block"
    assert "Hermes limit" in blocked["message"]
    assert decide(spent_cents=0, spend_limit_cents=255)["action"] == "approve"
    assert decide(spent_cents=0, spend_limit_cents=254)["action"] == "block"
    assert decide(spend_limit_cents=0)["action"] == "block"


def test_spend_limit_uses_integer_cents_only():
    assert money.as_cents(True) is None
    assert money.as_cents(2.55) is None
    assert money.as_cents(255) == 255
    assert money.format_cents(255) == "$2.55"
    assert money.format_cents(5000) == "$50.00"


def test_blocked_merchant_and_guard_do_not_ask():
    merchant = decide(preview=preview(merchant="Lucky Chips", merchant_blocked=True))
    assert merchant["action"] == "block"
    assert "Lucky Chips is blocked" in merchant["message"]
    guarded = decide(preview=preview(guard="block", guard_detail="Hidden instruction."))
    assert guarded["action"] == "block"
    assert "intent guard" in guarded["message"]
    assert decide(preview=preview(guard="unknown"))["action"] == "block"


def test_allowance_shortfall_blocks():
    directive = decide(preview=preview(amount_cents=9000, remaining_cents=8000))
    assert directive["action"] == "block"
    assert "allowance" in directive["message"]


def test_corrupt_ledger_fails_closed():
    assert decide(spent_cents=None)["action"] == "block"


def test_unattended_reasons_fail_closed():
    cases = [
        ({}, "No interactive approver"),
        ({"HERMES_CRON_SESSION": "1", "HERMES_INTERACTIVE": "1"}, "cron"),
        ({"HERMES_SINGLE_QUERY_SESSION": "true", "HERMES_INTERACTIVE": "1"}, "single-query"),
        ({"HERMES_KANBAN_TASK": "1"}, "unattended worker"),
        ({"HERMES_SESSION_PLATFORM": "webhook", "HERMES_EXEC_ASK": "1"}, "webhook"),
        ({"HERMES_YOLO": "1", "HERMES_INTERACTIVE": "1"}, "YOLO"),
    ]
    for env, needle in cases:
        attended, reason = attendance.classify(env)
        assert attended is False
        assert needle.lower() in reason.lower()
        directive = decide(attended=False, unattended_reason=reason)
        assert directive["action"] == "block"
        assert reason in directive["message"]


def test_interactive_surfaces_can_be_asked():
    assert attendance.classify(ATTENDED)[0] is True
    assert attendance.classify({"HERMES_SESSION_PLATFORM": "telegram"})[0] is True
    assert attendance.classify({"HERMES_SESSION_PLATFORM": "desktop"})[0] is True
    assert attendance.classify({"HERMES_SESSION_PLATFORM": "api_server", "HERMES_EXEC_ASK": "1"})[0] is True
    assert attendance.classify({"HERMES_SESSION_PLATFORM": "api_server"})[0] is False
    attended, reason = attendance.classify(ATTENDED, argv=["hermes", "--yolo"])
    assert attended is False
    assert "--yolo" in reason


def test_watch_prompt_says_there_is_no_second_approval():
    directive = decide(tool_name="watch_price", preview=preview(guard="pending", quote_id=""))
    assert directive["action"] == "approve"
    assert "second prompt" in directive["message"]


def test_other_tools_are_not_gated():
    assert decide(tool_name="get_budget") is None
