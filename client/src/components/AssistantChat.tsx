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

  const visible = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0
  );

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
                  {visible.map((m, i) => (
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
                  ))}
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
