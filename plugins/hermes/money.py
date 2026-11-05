"""Integer cents. Currency never passes through a float."""

from __future__ import annotations


def as_cents(value: object, *, positive: bool = False) -> int | None:
    """Accept a real int. Booleans are ints in Python and are rejected."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if positive and value <= 0:
        return None
    if value > 100_000_000 or value < -100_000_000:
        return None
    return value


def format_cents(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    amount = abs(cents)
    return f"{sign}${amount // 100}.{amount % 100:02d}"
