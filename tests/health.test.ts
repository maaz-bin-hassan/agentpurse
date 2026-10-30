import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { healthPayload } from "@/src/config";

describe("health", () => {
  const keys = ["PAYPAL_MODE", "AI_MODE", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to mock PayPal and mock AI with no credentials", () => {
    delete process.env.PAYPAL_MODE;
    delete process.env.AI_MODE;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    const body = healthPayload();
    expect(body).toMatchObject({
      ok: true,
      service: "agentpurse",
      paypalMode: "mock",
      aiMode: "mock",
      credentialsRequired: false,
      livePaypalConfigured: false,
      liveAiConfigured: false,
    });
  });

  it("reports live mode only when asked, still without requiring keys to boot", () => {
    process.env.PAYPAL_MODE = "live";
    process.env.AI_MODE = "live";
    const body = healthPayload();
    expect(body.paypalMode).toBe("live");
    expect(body.aiMode).toBe("live");
    expect(body.credentialsRequired).toBe(false);
    expect(body.livePaypalConfigured).toBe(false);
  });

  it("serves the health route as JSON", async () => {
    delete process.env.PAYPAL_MODE;
    const response = GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.service).toBe("agentpurse");
    expect(json.paypalMode).toBe("mock");
  });
});
