import type { Period } from "@/src/domain/types";

export function periodStart(period: Period, now: Date): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "monthly") {
    start.setUTCDate(1);
  } else if (period === "weekly") {
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - mondayOffset);
  }
  return start.toISOString();
}

export function periodLabel(period: Period): string {
  if (period === "daily") return "today";
  if (period === "weekly") return "this week";
  return "this month";
}
