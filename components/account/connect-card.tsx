"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/components/post-json";
import { CONNECT_CLIENTS, clientSnippet, spendingRules, type ConnectClient } from "@/src/domain/connect";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary !min-h-9 !px-3 !py-1 text-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ text, label }: { text: string; label?: string }) {
  return (
    <div className="relative mt-2 rounded-lg border border-line bg-sunk">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="eyebrow">{label ?? "Copy this"}</span>
        <CopyButton text={text} />
      </div>
      <pre className="money max-h-80 overflow-auto px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words">{text}</pre>
    </div>
  );
}

/** Setup text for one agent. A key is shown only right after it is made; otherwise a placeholder stands in. */
export function ConnectCard({
  agentId,
  agentName,
  mcpUrl,
  apiKey: initialKey = null,
  canRotate = false,
}: {
  agentId?: string;
  agentName: string;
  mcpUrl: string;
  apiKey?: string | null;
  canRotate?: boolean;
}) {
  const [client, setClient] = useState<ConnectClient>("prompt");
  const [apiKey, setApiKey] = useState<string | null>(initialKey);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const snippet = clientSnippet(client, { agentName, mcpUrl, apiKey });

  async function rotate() {
    if (!agentId) return;
    if (apiKey === null && !window.confirm(`Make a new key for ${agentName}? The current key stops working right away.`)) return;
    setPending(true);
    setMessage(null);
    try {
      const payload = await postJson(`/api/agents/${agentId}/key`);
      setApiKey(String(payload.apiKey));
      setMessage("New key below. Copy it now; it will not be shown again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not make a key.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {apiKey ? (
        <div className="rounded-lg border-2 border-brass px-3 py-2.5">
          <p className="eyebrow">{agentName}&apos;s key, shown once</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="money text-sm break-all">{apiKey}</code>
            <CopyButton text={apiKey} label="Copy key" />
          </div>
        </div>
      ) : canRotate ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>The key was shown once when it was made.</span>
          <button type="button" className="btn secondary !min-h-9 !px-3 !py-1 text-xs" disabled={pending} onClick={() => void rotate()}>
            Make a new key
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}

      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Connect with">
        {CONNECT_CLIENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={client === item.id}
            className={`min-h-9 cursor-pointer rounded-lg px-3 py-1 text-sm ${client === item.id ? "bg-sunk font-semibold" : "text-muted hover:text-ink"}`}
            onClick={() => setClient(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{snippet.note}</p>
      <CodeBlock text={snippet.body} label={snippet.kind === "shell" ? "Terminal" : snippet.kind === "json" ? "Config" : "Prompt"} />
      {client !== "prompt" && client !== "chatgpt" ? <CodeBlock text={spendingRules(agentName)} label="Spending rules" /> : null}
    </div>
  );
}
