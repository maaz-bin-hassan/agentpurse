"""MCP client: retries, no retry on purchase, SSE, timeouts, and host rules."""

import json

import pytest
from support import load

client_mod = load("client")
McpClient = client_mod.McpClient
McpError = client_mod.McpError


def tool_message(value, rpc_id=2):
    return json.dumps({
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {"content": [{"type": "text", "text": json.dumps(value)}]},
    }).encode()


class Script:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.slept = []

    def transport(self, method, url, headers, payload, timeout):
        self.calls.append({"method": method, "url": url, "payload": payload, "timeout": timeout, "auth": headers.get("Authorization", "")})
        body = payload or b""
        if b'"method": "initialize"' in body:
            return 200, {"content-type": "application/json"}, json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}}).encode()
        if b"notifications/initialized" in body:
            return 202, {}, b""
        if not self.responses:
            raise AssertionError("unexpected call")
        status, payload_body, content_type = self.responses.pop(0)
        return status, {"content-type": content_type}, payload_body

    def sleep(self, seconds):
        self.slept.append(seconds)


def client(script, **kwargs):
    return McpClient(
        "https://agentpurse.vercel.app",
        "test-key",
        transport=script.transport,
        sleep=script.sleep,
        **kwargs,
    )


def test_read_retries_then_succeeds():
    script = Script([
        (503, b"", "application/json"),
        (503, b"", "application/json"),
        (200, tool_message([{"name": "Grocer", "remainingCents": 8000}]), "application/json"),
    ])
    result = client(script).call_tool("get_budget", {})
    assert result == [{"name": "Grocer", "remainingCents": 8000}]
    tool_calls = [call for call in script.calls if call["payload"] and b"tools/call" in call["payload"]]
    assert len(tool_calls) == 3
    assert script.slept == [0.2, 0.4]
    assert all(call["auth"] == "Bearer test-key" for call in script.calls)
    assert "test-key" not in json.dumps(result)


def test_purchase_is_not_retried():
    script = Script([(503, b"", "application/json"), (200, tool_message({"ok": True}), "application/json")])
    with pytest.raises(McpError) as raised:
        client(script).call_tool("request_purchase", {"quoteId": "quote_1"})
    assert raised.value.status == 503
    tool_calls = [call for call in script.calls if call["payload"] and b"tools/call" in call["payload"]]
    assert len(tool_calls) == 1
    assert script.slept == []


def test_timeout_and_sse_and_redirect():
    class TimeoutScript(Script):
        def transport(self, method, url, headers, payload, timeout):
            self.calls.append(payload)
            if payload and b"initialize" in payload and b"notifications" not in payload:
                raise TimeoutError()
            return super().transport(method, url, headers, payload, timeout)

    script = TimeoutScript([])
    with pytest.raises(McpError) as raised:
        client(script).call_tool("get_budget", {})
    assert "timed out" in str(raised.value).lower()

    sse = 'data: ' + json.dumps({
        "jsonrpc": "2.0",
        "id": 2,
        "result": {"content": [{"type": "text", "text": json.dumps({"ok": True, "products": []})}]},
    }) + "\n\n"
    script = Script([(200, sse.encode(), "text/event-stream")])
    assert client(script).call_tool("search_products", {"query": "oat milk"}) == {"ok": True, "products": []}

    script = Script([(302, b"", "application/json")])
    with pytest.raises(McpError) as redirected:
        client(script).call_tool("get_budget", {})
    assert redirected.value.status == 302
    assert "not forwarded" in str(redirected.value)


def test_base_url_must_keep_the_key_on_an_https_host():
    client_mod.normalize_base_url("https://agentpurse.vercel.app/")
    client_mod.normalize_base_url("http://127.0.0.1:3000")
    for bad in ("http://agentpurse.vercel.app", "https://user:pw@agentpurse.vercel.app", "", "file:///tmp/mcp"):
        with pytest.raises(McpError):
            client_mod.normalize_base_url(bad)


def test_spend_status_404_is_distinct():
    class StatusScript(Script):
        def transport(self, method, url, headers, payload, timeout):
            self.calls.append((method, url))
            return 404, {"content-type": "application/json"}, json.dumps({"ok": False, "error": "Unknown payment."}).encode()

    script = StatusScript([])
    with pytest.raises(McpError) as raised:
        client(script).get_spend("intent_1")
    assert raised.value.status == 404
    assert script.calls[0][0] == "GET"
    assert script.calls[0][1].endswith("/api/spends/intent_1")
