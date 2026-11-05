"""Bounded wait for a cheque the clerk held.

The loop stops on a settled status, on the deadline, or when ``stop`` returns
a reason (the kill switch). It never waits past ``timeout_s``.
"""

from __future__ import annotations

from collections.abc import Callable

WAITING = frozenset({"pending_approval", "awaiting_paypal"})


def poll_until_settled(
    fetch: Callable[[], dict],
    *,
    timeout_s: float,
    interval_s: float,
    sleep: Callable[[float], None],
    monotonic: Callable[[], float],
    stop: Callable[[], str],
) -> dict:
    if timeout_s < 0:
        timeout_s = 0
    interval = interval_s if interval_s > 0 else 0.25
    deadline = monotonic() + timeout_s
    last: dict = {}
    while True:
        reason = stop()
        if reason:
            last = dict(last)
            last["timed_out"] = False
            last["stopped"] = reason
            return last
        last = dict(fetch())
        intent = last.get("intent")
        status = intent.get("status") if isinstance(intent, dict) else ""
        if status not in WAITING:
            last["timed_out"] = False
            return last
        if monotonic() >= deadline:
            last["timed_out"] = True
            return last
        sleep(min(interval, max(0.0, deadline - monotonic())))
