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
  /** Deep link into Sonarr/Radarr, when the tool result carried one. */
  link: string | null;
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
        link: r.link ?? null,
      }));
    }
    if ((toolName === "get_recently_added" || toolName === "get_upcoming") && Array.isArray(data.items)) {
      return data.items.slice(0, 8).map((r: any, i: number) => ({
        key: String(r.id ?? i),
        title: r.title,
        subtitle: r.subtitle,
        poster: r.poster ?? null,
        link: r.link ?? null,
      }));
    }
  } catch {
    /* not JSON, or not a shape with posters — nothing to show */
  }
  return [];
}

// The model's replies come back as plain text but the providers all write in
// markdown (**bold**, backtick code) — showing the raw asterisks looks
// broken. This is intentionally not a full markdown parser (no lists,
// links, headings): chat replies are a sentence or two, so bold, code and
// line breaks cover what actually shows up in practice.
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return parts.map((part, i) => {
    if (part === "\n") return <br key={i} />;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded sunken-strong px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// get_recently_added / get_upcoming answer "what's in the library" and can
// come back with a dozen unrelated titles. Matching only the user's question
// catches a direct "was Backrooms downloaded" (it names the title), but not
// "what movies were downloaded in the past 3 days" — that names a category
// and a time window, not a title, so nothing in the question matches any
// item, and everything unrelated still slipped through. The model's own
// answer is a better signal: it already did the filtering in prose ("here
// are the movies: Backrooms, The Love Hypothesis, Toy Story 5"), so matching
// against *that* text catches exactly the items the answer is actually
// about. Checked against both the question and the answer — either one
// naming an item is enough to keep it — and only falls back to the full,
// unfiltered list when neither text names anything at all, which is the
// right behavior for a genuine browse ("what's recently added").
function filterToConversation(
  items: PosterItem[],
  question: string | undefined,
  answer: string | undefined
): PosterItem[] {
  if (!question && !answer) return items;
  const q = question?.toLowerCase() ?? "";
  const a = answer?.toLowerCase() ?? "";
  const matches = items.filter((item) => {
    const title = item.title.toLowerCase();
    return q.includes(title) || a.includes(title);
  });
  return matches.length > 0 ? matches : items;
}

type RenderItem =
  | { kind: "bubble"; key: number; role: "user" | "assistant"; content: string }
  | { kind: "posters"; key: number; items: PosterItem[] };

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const out: RenderItem[] = [];
  messages.forEach((m, i) => {
    if ((m.role === "user" || m.role === "assistant") && m.content.trim()) {
      out.push({ kind: "bubble", key: i, role: m.role, content: m.content });
      return;
    }
    if (m.role === "tool") {
      const raw = extractPosters(m.toolName, m.content);
      if (raw.length === 0) return;

      let question: string | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === "user") {
          question = messages[j].content;
          break;
        }
      }

      let answer: string | undefined;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === "user") break; // next turn — not this one's answer
        if (messages[j].role === "assistant" && messages[j].content.trim()) {
          answer = messages[j].content;
          break;
        }
      }

      const items = filterToConversation(raw, question, answer);
      if (items.length > 0) out.push({ kind: "posters", key: i, items });
    }
  });
  return out;
}

function PosterStrip({ items }: { items: PosterItem[] }) {
  return (
    <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {items.map((item) => {
        const art = (
          <div className="aspect-[2/3] w-full overflow-hidden rounded-lg sunken-strong transition-opacity group-hover:opacity-80">
            {item.poster ? (
              <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1.5 text-center text-[10px] font-semibold uppercase text-ink-muted">
                {item.title}
              </div>
            )}
          </div>
        );
        return (
          <div key={item.key} className="w-28 shrink-0">
            {item.link ? (
              <a href={item.link} target="_blank" rel="noreferrer" className="group block" title="Open in Sonarr/Radarr">
                {art}
              </a>
            ) : (
              art
            )}
            <p className="mt-1.5 truncate text-xs font-medium text-ink">{item.title}</p>
            {item.subtitle && <p className="truncate text-[10px] text-ink-muted">{item.subtitle}</p>}
          </div>
        );
      })}
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

  const renderItems = buildRenderItems(messages);

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
              ) : renderItems.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Ask about your downloads, media library, containers, indexers, car or the weather.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {renderItems.map((item) =>
                    item.kind === "posters" ? (
                      <PosterStrip key={item.key} items={item.items} />
                    ) : (
                      <div
                        key={item.key}
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          item.role === "user"
                            ? "ml-auto bg-accent text-white"
                            : "sunken mr-auto text-ink"
                        }`}
                      >
                        {item.role === "assistant" ? renderInlineMarkdown(item.content) : item.content}
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
