import { publicBase } from "@/src/oauth/metadata";

export function GET() {
  const base = publicBase();
  return Response.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["purse"],
  });
}
