import { getAgentByApiKey } from "@/src/db/repository";
import { getDb } from "@/src/db/connection";
import { decodeStdio, encodeStdio, handleMcpMessage } from "@/src/mcp/protocol";

const key = process.env.AGENTPURSE_API_KEY;
if (!key) {
  console.error("AGENTPURSE_API_KEY is required");
  process.exit(1);
}

const sql = await getDb();
const agent = await getAgentByApiKey(sql, key);
if (!agent) {
  console.error("AGENTPURSE_API_KEY does not match an agent");
  process.exit(1);
}

let buffer = "";
process.stdin.on("data", (chunk: Buffer) => {
  buffer += chunk.toString("utf8");
  const decoded = decodeStdio(buffer);
  buffer = decoded.rest;
  for (const message of decoded.messages) {
    void handleMcpMessage(sql, { ownerId: agent.ownerId, agentId: agent.id }, message as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }).then((response) => {
      if (response) process.stdout.write(encodeStdio(response));
    });
  }
});
