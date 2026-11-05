"""JSON-RPC client for the AgentPurse streamable HTTP MCP.

Reads retry. Purchases do not: a timeout after the server accepted a
payment must not send it twice. Redirects are refused so the bearer token
cannot leave the configured host.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

READ_TOOLS = frozenset({
    "search_merchants",
    "search_products",
    "get_product",
    "check_price",
    "find_alternatives",
    "list_watches",
    "get_budget",
    "list_receipts",
})
RETRY_STATUSES = frozenset({429, 502, 503, 504})
MAX_BODY = 1_000_000

Transport = Callable[[str, str, dict[str, str], bytes | None, float], tuple[int, dict[str, str], bytes]]


class McpError(Exception):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


class _RefuseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def normalize_base_url(url: str) -> str:
    if not isinstance(url, str) or not url.strip():
        raise McpError("AgentPurse base_url is empty.")
    parsed = urllib.parse.urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if parsed.username or parsed.password or parsed.fragment:
        raise McpError("base_url must not carry credentials or a fragment.")
    loopback = host in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme == "https" and host:
        return url.strip().rstrip("/")
    if parsed.scheme == "http" and loopback:
        return url.strip().rstrip("/")
    raise McpError("base_url must be https, or http on localhost.")


def _urllib_transport(method: str, url: str, headers: dict[str, str], payload: bytes | None, timeout: float):
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    opener = urllib.request.build_opener(_RefuseRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read(MAX_BODY + 1)
            status = getattr(response, "status", 200)
            header_map = {key.lower(): value for key, value in response.headers.items()}
            return status, header_map, body
    except urllib.error.HTTPError as exc:
        body = exc.read(MAX_BODY + 1)
        header_map = {key.lower(): value for key, value in exc.headers.items()} if exc.headers else {}
        return exc.code, header_map, body
    except TimeoutError as exc:
        raise McpError("AgentPurse timed out.") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, TimeoutError):
            raise McpError("AgentPurse timed out.") from exc
        raise McpError("AgentPurse could not be reached.") from exc


def parse_mcp_body(content_type: str, raw: bytes) -> dict | None:
    if len(raw) > MAX_BODY:
        raise McpError("AgentPurse returned a response that was too large.")
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        return None
    if "text/event-stream" in content_type.lower():
        for line in text.splitlines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict) and ("result" in message or "error" in message):
                return message
        raise McpError("AgentPurse returned an event stream with no result.")
    try:
        message = json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpError("AgentPurse returned a response that was not JSON.") from exc
    if not isinstance(message, dict):
        raise McpError("AgentPurse returned a response that was not a JSON object.")
    return message


class McpClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout_s: float = 20,
        read_attempts: int = 3,
        transport: Transport | None = None,
        sleep: Callable[[float], None] | None = None,
    ):
        if not api_key or not isinstance(api_key, str):
            raise McpError("AgentPurse API key is missing.")
        self.base_url = normalize_base_url(base_url)
        self.api_key = api_key
        self.timeout_s = timeout_s if timeout_s > 0 else 20
        self.read_attempts = max(1, read_attempts)
        self._transport = transport or _urllib_transport
        self._sleep = sleep or _default_sleep
        self._next_id = 1
        self._session_id = ""
        self._initialized = False

    def call_tool(self, name: str, arguments: dict | None = None):
        self._ensure_session()
        attempts = self.read_attempts if name in READ_TOOLS else 1
        delay = 0.2
        last: McpError | None = None
        for attempt in range(attempts):
            try:
                message = self._rpc("tools/call", {"name": name, "arguments": arguments or {}})
                return unwrap_tool(message)
            except McpError as exc:
                last = exc
                retry = name in READ_TOOLS and exc.status in RETRY_STATUSES and attempt + 1 < attempts
                if not retry:
                    raise
                self._sleep(delay)
                delay *= 2
        assert last is not None
        raise last

    def get_spend(self, intent_id: str) -> dict:
        if not isinstance(intent_id, str) or not intent_id.strip() or "/" in intent_id or ".." in intent_id:
            raise McpError("That payment id is not usable.")
        url = f"{self.base_url}/api/spends/{urllib.parse.quote(intent_id, safe='')}"
        status, _headers, raw = self._request("GET", url, None)
        if status == 404:
            raise McpError("The payment status endpoint is not on this AgentPurse yet.", status=404)
        message = parse_mcp_body("application/json", raw)
        if status >= 400:
            error = message.get("error") if isinstance(message, dict) else None
            raise McpError(error if isinstance(error, str) and error else "Could not read the payment.", status=status)
        if not isinstance(message, dict) or message.get("ok") is not True or not isinstance(message.get("intent"), dict):
            raise McpError("AgentPurse returned an unexpected payment status.")
        return message

    def _ensure_session(self) -> None:
        if self._initialized:
            return
        self._rpc(
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "agentpurse-hermes", "version": "1.0.0"},
            },
        )
        self._notify("notifications/initialized", {})
        self._initialized = True

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": "agentpurse-hermes/1.0.0",
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        return headers

    def _rpc(self, method: str, params: dict) -> dict:
        message = {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params}
        self._next_id += 1
        status, headers, raw = self._request("POST", f"{self.base_url}/mcp", json.dumps(message).encode("utf-8"))
        session = headers.get("mcp-session-id", "")
        if session:
            self._session_id = session
        if status == 401:
            raise McpError("AgentPurse refused the API key.", status=401)
        if status >= 400:
            raise McpError(f"AgentPurse returned HTTP {status}.", status=status)
        parsed = parse_mcp_body(headers.get("content-type", ""), raw)
        if not isinstance(parsed, dict):
            raise McpError("AgentPurse returned an empty MCP response.")
        if isinstance(parsed.get("error"), dict):
            detail = parsed["error"].get("message")
            raise McpError(detail if isinstance(detail, str) and detail else "AgentPurse rejected the call.")
        return parsed

    def _notify(self, method: str, params: dict) -> None:
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        status, _headers, _raw = self._request("POST", f"{self.base_url}/mcp", json.dumps(message).encode("utf-8"))
        if status == 401:
            raise McpError("AgentPurse refused the API key.", status=401)
        if status >= 400 and status != 202:
            raise McpError(f"AgentPurse returned HTTP {status}.", status=status)

    def _request(self, method: str, url: str, payload: bytes | None):
        try:
            status, headers, body = self._transport(method, url, self._headers(), payload, self.timeout_s)
        except McpError:
            raise
        except TimeoutError as exc:
            raise McpError("AgentPurse timed out.") from exc
        except Exception as exc:
            raise McpError("AgentPurse could not be reached.") from exc
        if status in {301, 302, 303, 307, 308}:
            raise McpError("AgentPurse redirected the request. The API key was not forwarded.", status=status)
        return status, {key.lower(): value for key, value in headers.items()}, body


def unwrap_tool(message: dict):
    result = message.get("result")
    if not isinstance(result, dict):
        raise McpError("AgentPurse returned a tool result that was not an object.")
    content = result.get("content")
    text = ""
    if isinstance(content, list) and content and isinstance(content[0], dict):
        raw = content[0].get("text")
        text = raw if isinstance(raw, str) else ""
    if result.get("isError") is True:
        raise McpError(text or "AgentPurse could not complete that call.")
    if not text:
        raise McpError("AgentPurse returned an empty tool result.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpError("AgentPurse returned a tool result that was not JSON.") from exc


def _default_sleep(seconds: float) -> None:
    import time

    if seconds > 0:
        time.sleep(seconds)
