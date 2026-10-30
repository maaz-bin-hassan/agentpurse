export interface ActionResult<T> {
  status: number;
  body: T;
}

export function fail(status: number, error: string): ActionResult<{ ok: false; error: string }> {
  return { status, body: { ok: false, error } };
}

export function asResponse(result: { status: number; body: unknown }): Response {
  return Response.json(result.body, { status: result.status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}
