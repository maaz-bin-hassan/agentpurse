"""Hook, handler, ledger, polling, and slash commands against a fake MCP."""

import ast
import json

from support import ATTENDED, ROOT, Clock, FakeCtx, load, load_plugin

service = load("service")
ledger = load("ledger")
polling = load("polling")
commands = load("commands")
schemas = load("schemas")
McpError = load("client").McpError


class Purse:
    def __init__(self, purchase=None, spends=None, merchants=None, budget=None):
        self.purchase = purchase
        self.spends = list(spends or [])
        self.merchants = merchants if merchants is not None else [
            {"name": "Green Grocer", "blocked": False, "trusted": True, "category": "groceries"},
            {"name": "Lucky Chips", "blocked": True, "trusted": False, "category": "electronics"},
        ]
        self.budget = budget if budget is not None else [{"name": "Grocer", "remainingCents": 8000, "allowanceCents": 8000, "spentCents": 0}]
        self.calls = []

    def call_tool(self, name, arguments):
        self.calls.append((name, arguments))
        if name == "search_merchants":
            return self.merchants
        if name == "get_budget":
            return self.budget
        if name == "request_purchase":
            if isinstance(self.purchase, Exception):
                raise self.purchase
            return self.purchase
        if name == "list_watches":
            return [{"id": "watch_1", "status": "watching"}, {"id": "watch_2", "status": "cancelled"}]
        if name == "cancel_watch":
            return {"ok": True}
        if name == "list_receipts":
            return [{
                "merchantName": "Green Grocer",
                "amountCents": 255,
                "kind": "capture",
                "paypalOrderId": "PAY-OATS",
            }]
        raise AssertionError(name)

    def get_spend(self, intent_id):
        self.calls.append(("get_spend", intent_id))
        if not self.spends:
            raise McpError("no status")
        return self.spends.pop(0)


def ctx_with_quote(merchant="Green Grocer", amount=255, guard="pass", limit=5000):
    ctx = FakeCtx({"base_url": "https://agentpurse.vercel.app", "spend_limit_cents": limit, "approval_timeout_s": 30})
    ledger.remember_quote(ctx.state, {
        "quote_id": "quote_oats",
        "merchant": merchant,
        "amount_cents": amount,
        "guard": guard,
        "guard_detail": "Hidden instruction." if guard == "block" else "",
        "description": "oat milk",
        "stored_at": 1,
    })
    return ctx


def human_approves(ctx, directive, choice="once", **extra):
    service.on_approval_response(ctx, {
        "pattern_key": f"plugin_rule:{directive['rule_key']}",
        "pattern_keys": [f"plugin_rule:{directive['rule_key']}"],
        "choice": choice,
        "surface": "cli",
        **extra,
    })


def captured(order_id="PAY-OATS"):
    return {
        "ok": True,
        "explanation": "Paid Green Grocer $2.55 from Grocer's allowance.",
        "intent": {
            "id": "intent_oats",
            "status": "captured",
            "amountCents": 255,
            "merchantName": "Green Grocer",
            "ownerId": "purse_maaz",
        },
        "order": {"id": order_id},
        "fulfillment": "No retailer order was placed.",
    }


def test_approved_purchase_records_the_receipt_once():
    ctx = ctx_with_quote()
    purse = Purse(purchase=captured())
    directive = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", tool_call_id="call-1",
        env=ATTENDED, argv=[], client=purse, now=100,
    )
    assert directive["action"] == "approve"
    for needle in ("Green Grocer", "$2.55", "8000 cents", "Guard: pass"):
        assert needle in directive["message"]
    human_approves(ctx, directive)
    result = service.perform_governed(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", tool_call_id="call-1",
        env=ATTENDED, argv=[], client=purse, now=101,
    )
    assert result["order"]["id"] == "PAY-OATS"
    assert result["hermes"]["retailer_order"] is False
    assert ledger.spent_cents(ctx.state, "chat-1") == 255
    purchases = [name for name, _args in purse.calls if name == "request_purchase"]
    assert purchases == ["request_purchase"]
    again = service.perform_governed(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", tool_call_id="call-1",
        env=ATTENDED, argv=[], client=purse, now=102,
    )
    assert again["sent"] is False
    assert [name for name, _args in purse.calls if name == "request_purchase"] == ["request_purchase"]


def test_handler_without_a_grant_does_not_pay():
    ctx = ctx_with_quote()
    purse = Purse(purchase=captured())
    result = service.perform_governed(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", tool_call_id="call-9",
        env=ATTENDED, argv=[], client=purse, now=50,
    )
    assert result["sent"] is False
    assert "did not approve" in result["error"]
    assert "request_purchase" not in [name for name, _args in purse.calls]


def test_approval_without_a_person_does_not_pay():
    """YOLO, approvals off, cron approve mode, and saved rules skip the prompt. Smart mode is a model."""
    outcomes = [
        None,  # Hermes approved with no prompt, so no post_approval_response fired
        {"choice": "smart_approve", "decided_by": "aux_llm", "surface": "smart"},
        {"choice": "deny"},
        {"choice": "timeout"},
        {"choice": "cancelled"},
    ]
    for outcome in outcomes:
        ctx = ctx_with_quote()
        purse = Purse(purchase=captured())
        directive = service.on_pre_tool(
            ctx, "request_purchase", {"quoteId": "quote_oats"},
            task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=100,
        )
        assert directive["action"] == "approve"
        if outcome is not None:
            human_approves(ctx, directive, **outcome)
        result = service.perform_governed(
            ctx, "request_purchase", {"quoteId": "quote_oats"},
            task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=101,
        )
        assert result["sent"] is False
        assert "request_purchase" not in [name for name, _args in purse.calls]
        assert ledger.spent_cents(ctx.state, "chat-1") == 0


def test_saved_always_answer_cannot_cover_the_next_payment():
    ctx = ctx_with_quote()
    purse = Purse(purchase=captured())
    first = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=100,
    )
    human_approves(ctx, first, choice="always")
    second = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=110,
    )
    assert first["rule_key"] != second["rule_key"]


def test_other_approval_prompts_are_ignored():
    ctx = ctx_with_quote()
    purse = Purse(purchase=captured())
    directive = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=100,
    )
    service.on_approval_response(ctx, {"pattern_key": "rm_rf", "choice": "once"})
    service.on_approval_response(ctx, {"pattern_key": "plugin_rule:other:abc", "choice": "once"})
    result = service.perform_governed(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="task", session_id="chat-1", env=ATTENDED, argv=[], client=purse, now=101,
    )
    assert result["sent"] is False
    assert directive["action"] == "approve"


def test_blocked_merchant_guard_kill_and_limit_do_not_pay():
    blocked = ctx_with_quote(merchant="Lucky Chips")
    purse = Purse(purchase=captured())
    directive = service.on_pre_tool(
        blocked, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=1,
    )
    assert directive["action"] == "block"
    assert "Lucky Chips is blocked" in directive["message"]
    refused = service.perform_governed(
        blocked, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=2,
    )
    assert refused["sent"] is False
    assert "Lucky Chips is blocked" in refused["error"]

    guarded = ctx_with_quote(guard="block")
    directive = service.on_pre_tool(
        guarded, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=1,
    )
    assert directive["action"] == "block"
    assert "guard" in directive["message"].lower()

    killed = ctx_with_quote()
    ledger.set_killed(killed.state, True)
    directive = service.on_pre_tool(
        killed, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=1,
    )
    assert directive["action"] == "block"
    assert purse.calls == [] or all(name != "request_purchase" for name, _args in purse.calls)

    limited = ctx_with_quote(limit=200)
    directive = service.on_pre_tool(
        limited, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=1,
    )
    assert directive["action"] == "block"
    assert "Hermes limit" in directive["message"]
    assert "request_purchase" not in [name for name, _args in purse.calls]


def test_unattended_fails_closed_and_does_not_wait():
    ctx = ctx_with_quote()
    purse = Purse(purchase=captured())
    for env in ({}, {"HERMES_CRON_SESSION": "1", "HERMES_INTERACTIVE": "1"}, {"HERMES_SINGLE_QUERY_SESSION": "1"}):
        directive = service.on_pre_tool(
            ctx, "request_purchase", {"quoteId": "quote_oats"},
            task_id="t", session_id="s", env=env, argv=[], client=purse, now=1,
        )
        assert directive["action"] == "block"
        result = service.perform_governed(
            ctx, "request_purchase", {"quoteId": "quote_oats"},
            task_id="t", session_id="s", env=env, argv=[], client=purse, now=1,
        )
        assert result["sent"] is False
    assert "request_purchase" not in [name for name, _args in purse.calls]


def test_unknown_quote_and_hook_errors_block():
    ctx = FakeCtx()
    purse = Purse()
    directive = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "missing"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=purse, now=1,
    )
    assert directive["action"] == "block"
    assert "get_quote" in directive["message"]

    class Boom:
        def call_tool(self, name, arguments):
            raise RuntimeError("boom")

    ctx = ctx_with_quote()
    directive = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", env=ATTENDED, argv=[], client=Boom(), now=1,
    )
    assert directive["action"] == "block"


def test_passkey_poll_times_out_without_recording_spend():
    pending = {
        "ok": True,
        "intent": {
            "id": "intent_hold",
            "status": "pending_approval",
            "amountCents": 5000,
            "merchantName": "Green Grocer",
            "ownerId": "purse_maaz",
        },
        "order": None,
    }
    status = {
        "ok": True,
        "approvalUrl": "https://agentpurse.vercel.app/purses/purse_maaz?hold=intent_hold",
        "intent": pending["intent"],
    }
    ctx = ctx_with_quote(amount=5000, limit=8000)
    ledger.remember_quote(ctx.state, {
        "quote_id": "quote_oats",
        "merchant": "Green Grocer",
        "amount_cents": 5000,
        "guard": "pass",
        "guard_detail": "",
        "description": "oat milk",
        "stored_at": 1,
    })
    class Holding(Purse):
        def get_spend(self, intent_id):
            self.calls.append(("get_spend", intent_id))
            return status

    purse = Holding(purchase=pending, budget=[{"name": "Grocer", "remainingCents": 8000, "allowanceCents": 8000}])
    clock = Clock()
    directive = service.on_pre_tool(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", tool_call_id="hold-1",
        env=ATTENDED, argv=[], client=purse, now=10,
    )
    human_approves(ctx, directive)
    result = service.perform_governed(
        ctx, "request_purchase", {"quoteId": "quote_oats"},
        task_id="t", session_id="s", tool_call_id="hold-1",
        env=ATTENDED, argv=[], client=purse, now=11,
        sleeper=clock.sleep, monotonic_fn=clock.monotonic,
    )
    assert result["timedOut"] is True
    assert result["pending"] is True
    assert "intent_hold" in result["approvalUrl"]
    assert ledger.spent_cents(ctx.state, "s") == 0
    assert clock.slept <= 30
    assert clock.now <= 30


def test_poll_stops_on_capture_and_on_kill():
    clock = Clock()
    seen = {"n": 0}

    def fetch():
        seen["n"] += 1
        status = "pending_approval" if seen["n"] == 1 else "captured"
        return {"intent": {"status": status, "id": "intent_hold"}}

    outcome = polling.poll_until_settled(
        fetch, timeout_s=30, interval_s=2, sleep=clock.sleep, monotonic=clock.monotonic, stop=lambda: "",
    )
    assert outcome["intent"]["status"] == "captured"
    assert outcome["timed_out"] is False
    assert clock.slept == 2

    clock = Clock()

    def waiting():
        return {"intent": {"status": "pending_approval"}}

    stopped = polling.poll_until_settled(
        waiting, timeout_s=30, interval_s=2, sleep=clock.sleep, monotonic=clock.monotonic,
        stop=lambda: "killed",
    )
    assert stopped["stopped"] == "killed"
    assert clock.slept == 0


def test_quote_cache_and_commands():
    ctx = FakeCtx()
    purse = Purse()

    class QuotePurse(Purse):
        def call_tool(self, name, arguments):
            self.calls.append((name, arguments))
            if name == "get_quote":
                return {
                    "quoteId": "quote_new",
                    "merchant": "Green Grocer",
                    "amountCents": 255,
                    "guard": {"decision": "pass", "reasons": []},
                    "description": "oat milk",
                }
            return super().call_tool(name, arguments)

    quote_purse = QuotePurse()
    result = service.invoke_tool(ctx, "get_quote", {"merchant": "Green Grocer", "amountCents": 255, "originalTask": "oat milk"}, client=quote_purse, now=5)
    assert result["quoteId"] == "quote_new"
    assert ledger.get_quote(ctx.state, "quote_new")["amount_cents"] == 255

    text = commands.handle(ctx, "budget", session_id="s")
    # budget opens its own client unless we go through _budget with the fake. Call the private path.
    assert "Usage" in commands.handle(ctx, "")
    ctx.state = FakeCtx().state
    # Inject the fake by stubbing open_client for the command module's service reference.
    original = commands.open_client
    commands.open_client = lambda *args, **kwargs: purse
    try:
        budget = commands.handle(ctx, "budget", session_id="chat")
        receipts = commands.handle(ctx, "receipts")
        killed = commands.handle(ctx, "kill")
        resumed = commands.handle(ctx, "resume")
    finally:
        commands.open_client = original
    assert "Grocer" in budget
    assert "$80.00" in budget
    assert "PAY-OATS" in receipts
    assert "Kill switch is on" in killed
    assert "watch_1" in killed
    assert ledger.killed(ctx.state) is False
    assert "still waits for your approval" in resumed


def test_handlers_return_json_and_do_not_raise():
    plugin = load_plugin()
    ctx = FakeCtx()
    plugin.register(ctx)
    tools = load("tools")
    tools.bind(None)
    raw = tools.HANDLERS["get_budget"]({})
    body = json.loads(raw)
    assert body["ok"] is False
    assert isinstance(raw, str)

    class RaisingState:
        def get(self, key, default=None):
            raise RuntimeError("state down")

        def set(self, key, value):
            raise RuntimeError("state down")

    ctx.state = RaisingState()
    tools.bind(ctx)
    directive = plugin._before_tool("request_purchase", {"quoteId": "quote_oats"}, task_id="t")
    assert directive["action"] == "block"


def test_registration_matches_the_manifest_and_source_stays_clean():
    plugin = load_plugin()
    ctx = FakeCtx()
    plugin.register(ctx)
    names = [tool["name"] for tool in ctx.tools]
    assert names == schemas.TOOL_NAMES
    text = (ROOT / "plugin.yaml").read_text()
    for name in schemas.TOOL_NAMES:
        assert f"  - {name}" in text
    assert "pre_tool_call" in text
    assert "post_approval_response" in text
    assert [hook[0] for hook in ctx.hooks] == ["pre_tool_call", "post_approval_response"]
    for _name, callback, _kwargs in ctx.hooks:
        assert callback.__code__.co_flags & 0x08  # accepts **kwargs
    catalog = (ROOT / "catalog" / "agentpurse.yaml").read_text()
    assert "    - post_approval_response" in catalog
    assert ctx.commands[0][0] == "purse"
    assert ctx.skills and ctx.skills[0][0] == "shop"

    banned_modules = {"subprocess", "pickle", "ctypes", "socket", "dotenv"}
    for path in ROOT.glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert {alias.name.split(".")[0] for alias in node.names}.isdisjoint(banned_modules)
            if isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] not in banned_modules
            if isinstance(node, ast.Attribute) and node.attr == "environ":
                raise AssertionError(f"{path.name} reads environ")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}:
                raise AssertionError(f"{path.name} calls {node.func.id}")


def test_missing_key_is_a_json_error_not_an_exception():
    secrets = load("secrets")
    assert secrets.read_api_key(lambda name: None) is None
    assert secrets.read_api_key(lambda name: "  agpk_demo  ") == "agpk_demo"
    assert "agpk_demo" not in secrets.redact("refused agpk_demo token", "agpk_demo")
