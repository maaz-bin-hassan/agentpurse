export async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    const error = typeof payload.error === "string" ? payload.error : "The purse could not do that.";
    throw new Error(error);
  }
  return payload;
}
