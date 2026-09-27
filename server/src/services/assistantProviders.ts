import { lanFetch } from "../lib/lanFetch.js";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments — shared as-is across all three providers. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Only on assistant messages that called a tool. */
  toolCalls?: ToolCall[];
  /** Only on tool-result messages — pairs the result back to its call. */
  toolCallId?: string;
  toolName?: string;
}

export interface ProviderReply {
  content: string;
  toolCalls: ToolCall[];
}

export interface ProviderConfig {
  provider: "ollama" | "anthropic" | "openai";
  ollamaUrl?: string;
  ollamaModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

let callCounter = 0;
function nextId(): string {
  callCounter += 1;
  return `call_${Date.now()}_${callCounter}`;
}

// ---------------------------------------------------------------------------
// Anthropic (Messages API)
// ---------------------------------------------------------------------------

async function callAnthropic(
  cfg: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  tools: ToolSpec[]
): Promise<ProviderReply> {
  const apiMessages: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      apiMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const call of m.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      }
      apiMessages.push({ role: "assistant", content });
      continue;
    }
    apiMessages.push({ role: m.role, content: m.content });
  }

  const res = await lanFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.anthropicApiKey ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.anthropicModel || "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages: apiMessages,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error (HTTP ${res.status}): ${await res.text().catch(() => "")}`);
  const data: any = await res.json();

  let content = "";
  const toolCalls: ToolCall[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") content += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, args: block.input ?? {} });
    }
  }
  return { content, toolCalls };
}

// ---------------------------------------------------------------------------
// OpenAI (Chat Completions)
// ---------------------------------------------------------------------------

async function callOpenAiStyle(
  endpoint: string,
  headers: Record<string, string>,
  model: string,
  system: string,
  messages: ChatMessage[],
  tools: ToolSpec[]
): Promise<ProviderReply> {
  const apiMessages: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      apiMessages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      apiMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });
      continue;
    }
    apiMessages.push({ role: m.role, content: m.content });
  }

  const res = await lanFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  });
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}): ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  const message = data.choices?.[0]?.message ?? {};

  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((c: any) => ({
    id: c.id ?? nextId(),
    name: c.function?.name,
    args: safeParseJson(c.function?.arguments),
  }));
  return { content: message.content ?? "", toolCalls };
}

function safeParseJson(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Ollama (local — OpenAI-style tool calling under its own /api/chat envelope)
// ---------------------------------------------------------------------------

async function callOllama(
  cfg: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  tools: ToolSpec[]
): Promise<ProviderReply> {
  const apiMessages: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      apiMessages.push({ role: "tool", content: m.content });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      apiMessages.push({
        role: "assistant",
        content: m.content || "",
        tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })),
      });
      continue;
    }
    apiMessages.push({ role: m.role, content: m.content });
  }

  const url = (cfg.ollamaUrl ?? "").replace(/\/+$/, "");
  const res = await lanFetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: cfg.ollamaModel || "llama3.1",
      messages: apiMessages,
      stream: false,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  });
  if (!res.ok) throw new Error(`Ollama error (HTTP ${res.status}): ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  const message = data.message ?? {};

  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((c: any) => ({
    id: nextId(),
    name: c.function?.name,
    args: c.function?.arguments ?? {},
  }));
  return { content: message.content ?? "", toolCalls };
}

// ---------------------------------------------------------------------------

export async function callProvider(
  cfg: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  tools: ToolSpec[]
): Promise<ProviderReply> {
  if (cfg.provider === "anthropic") return callAnthropic(cfg, system, messages, tools);
  if (cfg.provider === "openai") {
    return callOpenAiStyle(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${cfg.openaiApiKey ?? ""}` },
      cfg.openaiModel || "gpt-4o-mini",
      system,
      messages,
      tools
    );
  }
  return callOllama(cfg, system, messages, tools);
}
