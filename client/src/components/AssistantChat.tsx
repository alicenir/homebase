import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import type { AssistantTurnResult, ChatMessage, PendingCall } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onRequestLogin: () => void;
  /** A question typed into the header's "Ask anything" bar, to send as soon as the panel opens. */
  pendingQuestion: string | null;
  onConsumePendingQuestion: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  add_media: "Add to library",
  control_downloads: "Change download queue",
};

interface PosterItem {
  key: string;
  title: string;
  subtitle?: string;
  poster: string | null;
}

// The model only ever gets these tool results as text, so it can describe a
// movie but never actually show it. Rendering the same poster URLs the tool
// already returned — client-side, independent of what the model says — is
// what makes "search for X" feel like a real media search instead of a wall
// of text.
function extractPosters(toolName: string | undefined, content: string): PosterItem[] {
  if (!toolName) return [];
  try {
    const data = JSON.parse(content);
    if (toolName === "search_media" && Array.isArray(data)) {
      return data.slice(0, 8).map((r: any, i: number) => ({
        key: String(r.externalId ?? i),
        title: r.title ?? "Unknown",
        subtitle: r.year ? String(r.year) : undefined,
        poster: r.poster ?? null,
      }));
    }
    if ((toolName === "get_recently_added" || toolName === "get_upcoming") && Array.isArray(data.items)) {
      return data.items.slice(0, 8).map((r: any, i: number) => ({
        key: String(r.id ?? i),
        title: r.title,
        subtitle: r.subtitle,
        poster: r.poster ?? null,
      }));
    }
  } catch {
    /* not JSON, or not a shape with posters — nothing to show */
  }
  return [];
}

function PosterStrip({ items }: { items: PosterItem[] }) {
  return (
    <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => (
        <div key={item.key} className="w-20 shrink-0">
          <div className="aspect-[2/3] w-full overflow-hidden rounded-lg sunken-strong">
            {item.poster ? (
              <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] font-semibold uppercase text-ink-muted">
                {item.title}
              </div>
            )}
          </div>
          <p className="mt-1 truncate text-[10px] font-medium text-ink">{item.title}</p>
          {item.subtitle && <p className="truncate text-[9px] text-ink-muted">{item.subtitle}</p>}
        </div>
      ))}
    </div>
  );
}

export function AssistantChat({
  open,
  onClose,
  onRequestLogin,
  pendingQuestion,
  onConsumePendingQuestion,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingCalls, setPendingCalls] = useState<PendingCall[] | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingCalls, sending]);

  useEffect(() => {
    if (open && pendingQuestion) {
      onConsumePendingQuestion();
      void send(pendingQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingQuestion]);

  async function runTurn(history: ChatMessage[], approvedCallIds: string[] = []) {
    setSending(true);
    try {
      const result = await api.post<AssistantTurnResult>("/assistant/chat", {
        messages: history,
        approvedCallIds,
      });
      handleResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assistant request failed");
    } finally {
      setSending(false);
    }
  }

  function handleResult(result: AssistantTurnResult) {
    setMessages(result.messages);
    if (result.status === "not_configured") {
      setNotConfigured(true);
      setPendingCalls(null);
    } else if (result.status === "needs_confirmation") {
      setPendingCalls(result.pendingCalls ?? []);
    } else if (result.status === "needs_login") {
      setPendingCalls(null);
      onRequestLogin();
    } else if (result.status === "error") {
      setPendingCalls(null);
      toast.error(result.error ?? "The assistant hit an error");
    } else {
      setPendingCalls(null);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    await runTurn(next);
  }

  async function approveCalls() {
    if (!pendingCalls) return;
    const ids = pendingCalls.map((c) => c.id);
    setPendingCalls(null);
    await runTurn(messages, ids);
  }

  async function declineCalls() {
    if (!pendingCalls) return;
    const declined: ChatMessage[] = [
      ...messages,
      ...pendingCalls.map((c) => ({
        role: "tool" as const,
        content: JSON.stringify({ error: "The user declined this action." }),
        toolCallId: c.id,
        toolName: c.name,
      })),
    ];
    setPendingCalls(null);
    await runTurn(declined);
  }

  const visible = messages.filter((m) => {
    if (m.role === "user" || m.role === "assistant") return m.content.trim().length > 0;
    if (m.role === "tool") return extractPosters(m.toolName, m.content).length > 0;
    return false;
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex w-full max-w-lg flex-col rounded-2xl"
            style={{ height: "min(640px, 80vh)" }}
          >
            <div className="hairline flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="text-accent">✦</span> Ask anything
              </h2>
              <button onClick={onClose} className="text-ink-muted hover:text-ink">
                ✕
              </button>
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
              {notConfigured ? (
                <p className="text-sm text-ink-muted">
                  The assistant isn't set up yet — connect a provider under{" "}
                  <span className="font-semibold text-ink">Settings → Assistant</span>.
                </p>
              ) : visible.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Ask about your downloads, media library, containers, indexers, car or the weather.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {visible.map((m, i) =>
                    m.role === "tool" ? (
                      <PosterStrip key={i} items={extractPosters(m.toolName, m.content)} />
                    ) : (
                      <div
                        key={i}
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                          m.role === "user"
                            ? "ml-auto bg-accent text-white"
                            : "sunken mr-auto text-ink"
                        }`}
                      >
                        {m.content}
                      </div>
                    )
                  )}
                </div>
              )}

              {sending && (
                <p className="mt-3 text-xs text-ink-muted">Thinking…</p>
              )}

              {pendingCalls && pendingCalls.length > 0 && (
                <div className="hairline mt-3 flex flex-col gap-2 rounded-xl border p-3">
                  <p className="text-xs font-semibold text-ink">This needs your approval:</p>
                  {pendingCalls.map((c) => (
                    <p key={c.id} className="text-xs text-ink-muted">
                      {TOOL_LABELS[c.name] ?? c.name} — {JSON.stringify(c.args)}
                    </p>
                  ))}
                  <div className="mt-1 flex gap-2">
                    <button onClick={approveCalls} className="btn-primary flex-1 py-1.5 text-xs">
                      Run it
                    </button>
                    <button onClick={declineCalls} className="btn-ghost flex-1 py-1.5 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="hairline border-t p-3">
              <div className="sunken flex items-center gap-2 rounded-xl px-3">
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !sending && send(input)}
                  placeholder="Type a question…"
                  disabled={sending || Boolean(pendingCalls?.length)}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                />
                <button
                  onClick={() => send(input)}
                  disabled={sending || !input.trim() || Boolean(pendingCalls?.length)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
