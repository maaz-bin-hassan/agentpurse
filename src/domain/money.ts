export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  return `${sign}${dollars}.${remainder}`;
}

export function decimalToCents(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const dollars = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = dollars * 100 + fraction;
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}
