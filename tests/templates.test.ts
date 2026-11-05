import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, buildAgentFromTemplate, MAX_AGENTS_PER_OWNER } from "@/src/domain/templates";
import { CATEGORIES } from "@/src/domain/types";

const now = new Date("2026-11-05T12:00:00Z");

describe("agent templates", () => {
  it("ships eight templates that each build a valid agent as-is", () => {
    expect(AGENT_TEMPLATES).toHaveLength(8);
    expect(new Set(AGENT_TEMPLATES.map((t) => t.id)).size).toBe(8);
    for (const template of AGENT_TEMPLATES) {
      const built = buildAgentFromTemplate("owner_a", template.id, {}, now);
      expect(built.ok, template.id).toBe(true);
      if (!built.ok) continue;
      const { agent, apiKey } = built;
      expect(apiKey.startsWith("agpk_")).toBe(true);
      expect(apiKey.length).toBeGreaterThan(30);
      expect(agent.apiKeyPrefix).toBe(apiKey.slice(0, 12));
      expect(agent.ownerId).toBe("owner_a");
      expect(agent.allowedCategories.every((c) => (CATEGORIES as readonly string[]).includes(c))).toBe(true);
      expect(Number.isInteger(agent.allowanceCents)).toBe(true);
      expect(agent.approvalThresholdCents).toBeLessThanOrEqual(agent.perTxnCapCents);
      expect(agent.perTxnCapCents).toBeLessThanOrEqual(agent.dailyCapCents);
      expect(agent.policySource).toBe(`template:${template.id}`);
    }
  });

  it("applies the owner's edits without changing the template", () => {
    const before = JSON.stringify(AGENT_TEMPLATES);
    const built = buildAgentFromTemplate(
      "owner_a",
      "grocery-runner",
      { name: "Pantry", provider: "cursor", allowanceCents: 12_000, perTxnCapCents: 5_000, dailyCapCents: 9_000, approvalThresholdCents: 2_000, trustedMerchantsOnly: true },
      now,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.agent).toMatchObject({ name: "Pantry", provider: "cursor", allowanceCents: 12_000, perTxnCapCents: 5_000, approvalThresholdCents: 2_000, trustedMerchantsOnly: true });
    expect(JSON.stringify(AGENT_TEMPLATES)).toBe(before);
  });

  it("rejects caps that contradict each other, unknown templates, and float money", () => {
    expect(buildAgentFromTemplate("o", "nope", {}, now)).toMatchObject({ ok: false });
    expect(buildAgentFromTemplate("o", "grocery-runner", { approvalThresholdCents: 9_000, perTxnCapCents: 5_000 }, now)).toMatchObject({ ok: false });
    expect(buildAgentFromTemplate("o", "grocery-runner", { perTxnCapCents: 50_000, dailyCapCents: 10_000 }, now)).toMatchObject({ ok: false });
    expect(buildAgentFromTemplate("o", "grocery-runner", { allowanceCents: 10.5 }, now)).toMatchObject({ ok: false });
    expect(buildAgentFromTemplate("o", "grocery-runner", { allowedCategories: ["casino"] as never }, now)).toMatchObject({ ok: false });
    expect(buildAgentFromTemplate("o", "grocery-runner", { allowedCategories: [] }, now)).toMatchObject({ ok: false });
    expect(MAX_AGENTS_PER_OWNER).toBe(20);
  });
});
