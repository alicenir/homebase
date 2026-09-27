import { getSetting } from "../db.js";
import { addMedia, getAddOptions, getRecentMedia, getUpcoming, lookup } from "./arr.js";
import {
  deleteJob,
  getSnapshot as getSabnzbdSnapshot,
  pauseJob,
  pauseQueue,
  resumeJob,
  resumeQueue,
} from "./sabnzbd.js";
import { getStatus as getPortainerStatus, getHostStats } from "./portainer.js";
import { getStatus as getProwlarrStatus } from "./prowlarr.js";
import { getActivity as getTautulliActivity } from "./tautulli.js";
import { getSnapshot as getTeslaSnapshot } from "./teslamate.js";
import { getWeather } from "./weather.js";
import {
  callProvider,
  type ChatMessage,
  type ProviderConfig,
  type ToolCall,
  type ToolSpec,
} from "./assistantProviders.js";

export type { ChatMessage } from "./assistantProviders.js";

interface ToolDef extends ToolSpec {
  mutating: boolean;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_downloads",
    description: "Get the current SABnzbd download queue and recent history.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getSabnzbdSnapshot(),
  },
  {
    name: "get_recently_added",
    description: "Get recently added movies and TV episodes from Sonarr/Radarr.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getRecentMedia(),
  },
  {
    name: "get_upcoming",
    description: "Get what's airing tonight and over the next week, from Sonarr's calendar.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getUpcoming(),
  },
  {
    name: "search_media",
    description:
      "Search Sonarr (TV) or Radarr (movies) for a title, to see if it exists or could be added. Does not add it.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", enum: ["sonarr", "radarr"] },
        term: { type: "string", description: "Title to search for" },
      },
      required: ["service", "term"],
    },
    mutating: false,
    run: async (args) => lookup(args.service as "sonarr" | "radarr", String(args.term)),
  },
  {
    name: "get_car_status",
    description: "Get the Tesla's current battery, range, charging, climate and lock status.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getTeslaSnapshot(),
  },
  {
    name: "get_indexer_status",
    description: "Get Prowlarr indexer health — which indexers are blocked or failing.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getProwlarrStatus(),
  },
  {
    name: "get_containers",
    description: "Get Docker container status (running/exited/restarting) via Portainer.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getPortainerStatus(),
  },
  {
    name: "get_host_stats",
    description: "Get approximate CPU, memory and disk usage of the Docker host, via Portainer.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getHostStats(),
  },
  {
    name: "get_now_playing",
    description: "Get what's currently playing on Plex, via Tautulli.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getTautulliActivity(),
  },
  {
    name: "get_weather",
    description: "Get the current weather and short-term forecast for the configured location.",
    parameters: { type: "object", properties: {} },
    mutating: false,
    run: () => getWeather(),
  },
  {
    name: "add_media",
    description:
      "Search for a title and add it to Sonarr or Radarr using the first matching result and the default root folder/quality profile, optionally triggering an immediate search. This changes the user's media library — only call it after the user has clearly confirmed they want it added.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", enum: ["sonarr", "radarr"] },
        term: { type: "string", description: "Title to search for and add" },
        searchNow: { type: "boolean", description: "Trigger an immediate download search (default true)" },
      },
      required: ["service", "term"],
    },
    mutating: true,
    run: async (args) => {
      const service = args.service as "sonarr" | "radarr";
      const results = await lookup(service, String(args.term));
      if (results.length === 0) return { error: `No ${service} matches found for "${args.term}".` };
      const match = results.find((r) => r.existingId > 0) ?? results[0];
      if (match.existingId > 0) {
        return { alreadyExists: true, title: match.title };
      }
      const options = await getAddOptions(service);
      if (options.rootFolders.length === 0 || options.qualityProfiles.length === 0) {
        return { error: `${service} has no root folder or quality profile configured yet.` };
      }
      const created = await addMedia({
        service,
        externalId: match.externalId,
        title: match.title,
        year: match.year,
        qualityProfileId: options.qualityProfiles[0].id,
        rootFolderPath: options.rootFolders[0].path,
        searchNow: args.searchNow !== false,
      });
      return { added: true, title: created.title, id: created.id };
    },
  },
  {
    name: "control_downloads",
    description: "Pause or resume the whole SABnzbd queue, or pause/resume/remove one job by its nzoId.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["pause_all", "resume_all", "pause_job", "resume_job", "remove_job"],
        },
        nzoId: { type: "string", description: "Required for *_job actions — from get_downloads" },
      },
      required: ["action"],
    },
    mutating: true,
    run: async (args) => {
      const action = args.action as string;
      const nzoId = args.nzoId as string | undefined;
      if (action === "pause_all") {
        await pauseQueue();
      } else if (action === "resume_all") {
        await resumeQueue();
      } else if (action === "pause_job") {
        if (!nzoId) return { error: "nzoId is required" };
        await pauseJob(nzoId);
      } else if (action === "resume_job") {
        if (!nzoId) return { error: "nzoId is required" };
        await resumeJob(nzoId);
      } else if (action === "remove_job") {
        if (!nzoId) return { error: "nzoId is required" };
        await deleteJob(nzoId);
      } else {
        return { error: `Unknown action ${action}` };
      }
      return { ok: true };
    },
  },
];

function toolSpecs(): ToolSpec[] {
  return TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

const SYSTEM_PROMPT = `You are the assistant built into Homebase, a self-hosted homelab dashboard. \
You can answer questions about the user's downloads, media library, upcoming episodes, indexers, \
Docker containers, Tesla, Plex playback and weather by calling the provided tools — always call a \
tool to get live data rather than guessing. Keep answers short and conversational, formatted for a \
small chat panel. Only call add_media or control_downloads when the user has clearly asked for that \
action; those calls require the user's explicit approval before they run, so it's fine to propose them.`;

function getProviderConfig(): ProviderConfig | null {
  const provider = getSetting("assistant_provider");
  if (provider === "ollama") {
    const url = getSetting("assistant_ollama_url");
    if (!url) return null;
    return { provider, ollamaUrl: url, ollamaModel: getSetting("assistant_ollama_model") || undefined };
  }
  if (provider === "anthropic") {
    const key = getSetting("assistant_anthropic_api_key");
    if (!key) return null;
    return {
      provider,
      anthropicApiKey: key,
      anthropicModel: getSetting("assistant_anthropic_model") || undefined,
    };
  }
  if (provider === "openai") {
    const key = getSetting("assistant_openai_api_key");
    if (!key) return null;
    return { provider, openaiApiKey: key, openaiModel: getSetting("assistant_openai_model") || undefined };
  }
  return null;
}

export function isAssistantConfigured(): boolean {
  return getProviderConfig() != null;
}

export interface PendingCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description: string;
}

export interface AssistantTurnResult {
  status: "done" | "needs_confirmation" | "needs_login" | "not_configured" | "error";
  messages: ChatMessage[];
  pendingCalls?: PendingCall[];
  error?: string;
}

const MAX_ITERATIONS = 4;

export async function runAssistantTurn(
  history: ChatMessage[],
  opts: { authed: boolean; approvedCallIds: string[] }
): Promise<AssistantTurnResult> {
  const cfg = getProviderConfig();
  if (!cfg) return { status: "not_configured", messages: history };

  const messages = [...history];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const last = messages[messages.length - 1];
    let pendingToolCalls: ToolCall[];

    if (last?.role === "assistant" && last.toolCalls?.length) {
      // Resuming a turn where the model already asked for tools and we're
      // coming back after the client approved (or the user just re-sent the
      // same history) — don't ask the model again, go straight to running them.
      pendingToolCalls = last.toolCalls;
    } else {
      let reply;
      try {
        reply = await callProvider(cfg, SYSTEM_PROMPT, messages, toolSpecs());
      } catch (err) {
        return { status: "error", messages, error: err instanceof Error ? err.message : "Assistant request failed" };
      }

      if (reply.toolCalls.length === 0) {
        messages.push({ role: "assistant", content: reply.content });
        return { status: "done", messages };
      }

      messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
      pendingToolCalls = reply.toolCalls;
    }

    const mutatingCalls = pendingToolCalls.filter((c) => findTool(c.name)?.mutating);
    // Checked before approvedCallIds, on purpose: a client that already knows
    // which ids to approve (e.g. by replaying a request) still isn't allowed
    // to skip straight past sign-in for an action it was never shown.
    if (mutatingCalls.length > 0 && !opts.authed) {
      return { status: "needs_login", messages };
    }

    const unresolved = mutatingCalls.filter((c) => !opts.approvedCallIds.includes(c.id));
    if (unresolved.length > 0) {
      return {
        status: "needs_confirmation",
        messages,
        pendingCalls: unresolved.map((c) => ({
          id: c.id,
          name: c.name,
          args: c.args,
          description: findTool(c.name)?.description ?? c.name,
        })),
      };
    }

    for (const call of pendingToolCalls) {
      const tool = findTool(call.name);
      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool ${call.name}` };
      } else if (tool.mutating && !opts.authed) {
        result = { error: "Not authorized to perform this action." };
      } else {
        try {
          result = await tool.run(call.args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool failed" };
        }
      }
      messages.push({ role: "tool", content: JSON.stringify(result), toolCallId: call.id, toolName: call.name });
    }
  }

  return { status: "error", messages, error: "The assistant took too many steps without finishing." };
}
