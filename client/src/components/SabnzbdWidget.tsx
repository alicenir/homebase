import { motion } from "framer-motion";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { formatSpeed, formatTimeLeft } from "../lib/format";
import { socket } from "../lib/socket";
import { useStore } from "../store/useStore";
import type { SabnzbdSlot } from "../types";

function barColor(status: string) {
  switch (status.toLowerCase()) {
    case "downloading":
      return "bg-accent";
    case "paused":
      return "bg-amber-500";
    case "queued":
      return "bg-ink-muted";
    default:
      return "bg-emerald-500";
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      <p
        className={`truncate text-sm font-semibold tabular-nums ${
          accent ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function QueueRow({ slot, authed }: { slot: SabnzbdSlot; authed: boolean }) {
  const isPaused = slot.status.toLowerCase() === "paused";

  async function act(fn: () => Promise<unknown>, label: string) {
    try {
      await fn();
    } catch {
      toast.error(`${label} failed`);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl sunken p-3 transition-colors hover-sunken"
    >
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={slot.filename}>
          {slot.filename}
        </p>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">
          {slot.percentage.toFixed(0)}%
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full sunken-strong">
        <motion.div
          className={`h-full rounded-full ${barColor(slot.status)}`}
          initial={false}
          animate={{ width: `${Math.max(slot.percentage, 1.5)}%` }}
          transition={{ ease: "easeOut", duration: 0.4 }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        {slot.cat && (
          <span className="shrink-0 rounded sunken-strong px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {slot.cat}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {slot.sizeleft} left of {slot.size}
        </span>

        {authed ? (
          <span className="shrink-0 tabular-nums group-hover:hidden">
            {formatTimeLeft(slot.timeleft)}
          </span>
        ) : (
          <span className="shrink-0 tabular-nums">{formatTimeLeft(slot.timeleft)}</span>
        )}

        {authed && (
          <span className="hidden shrink-0 gap-2 group-hover:flex">
            <button
              onClick={() =>
                act(
                  () =>
                    isPaused
                      ? api.post(`/sabnzbd/jobs/${slot.nzo_id}/resume`)
                      : api.post(`/sabnzbd/jobs/${slot.nzo_id}/pause`),
                  "Update"
                )
              }
              className="font-medium text-ink-muted hover:text-accent"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => act(() => api.delete(`/sabnzbd/jobs/${slot.nzo_id}`), "Remove")}
              className="font-medium text-ink-muted hover:text-red-400"
            >
              Remove
            </button>
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function SabnzbdWidget() {
  const sabnzbd = useStore((s) => s.sabnzbd);
  const setSabnzbd = useStore((s) => s.setSabnzbd);
  const authed = useStore((s) => s.authed);

  useEffect(() => {
    let gotPush = false;

    function onUpdate(snapshot: any) {
      gotPush = true;
      setSabnzbd(snapshot);
    }
    socket.on("sabnzbd:update", onUpdate);

    // Seed over REST in case the server's connect-time emit lands before this
    // listener is attached (see TeslaWidget for the same race).
    api
      .get("/sabnzbd/status")
      .then((initial) => {
        if (!gotPush) setSabnzbd(initial as any);
      })
      .catch(() => {});

    return () => {
      socket.off("sabnzbd:update", onUpdate);
    };
  }, [setSabnzbd]);

  if (!sabnzbd || !sabnzbd.configured) return null;

  async function toggleQueue() {
    if (!sabnzbd) return;
    try {
      await (sabnzbd.paused ? api.post("/sabnzbd/resume") : api.post("/sabnzbd/pause"));
    } catch {
      toast.error("Could not update the queue");
    }
  }

  const active = sabnzbd.queue.length;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ↓
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">Downloads</h2>
          <p className="truncate text-xs text-ink-muted">
            {!sabnzbd.reachable
              ? "Cannot reach SABnzbd"
              : sabnzbd.paused
                ? "Queue paused"
                : active === 0
                  ? "Idle"
                  : `${active} active`}
          </p>
        </div>

        {sabnzbd.reachable && authed && (
          <button
            onClick={toggleQueue}
            className="shrink-0 whitespace-nowrap rounded-lg hairline border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/60 hover:text-accent"
          >
            {sabnzbd.paused ? "Resume" : "Pause"}
          </button>
        )}
      </div>

      {sabnzbd.reachable && (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl sunken px-3.5 py-2.5">
          <Stat label="Speed" value={formatSpeed(sabnzbd.speedBps)} accent={!sabnzbd.paused && active > 0} />
          <Stat label="Time left" value={formatTimeLeft(sabnzbd.timeleft)} />
          <Stat label="Remaining" value={sabnzbd.sizeleft || "—"} />
        </div>
      )}

      {!sabnzbd.reachable ? (
        <p className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
          {sabnzbd.error === "not_configured"
            ? "SABnzbd is not configured."
            : "SABnzbd is unreachable — check the URL and API key in Settings."}
        </p>
      ) : active === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nothing downloading right now</p>
      ) : (
        <div className="scrollbar-thin mt-3 flex max-h-[264px] flex-col gap-2 overflow-y-auto">
          {sabnzbd.queue.map((slot) => (
            <QueueRow key={slot.nzo_id} slot={slot} authed={authed} />
          ))}
        </div>
      )}

      {sabnzbd.history.length > 0 && (
        <div className="mt-4 hairline border-t pt-3">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Recently completed
          </h3>
          <ul className="flex flex-col gap-1.5">
            {sabnzbd.history.slice(0, 5).map((h) => (
              <li key={h.nzo_id} className="flex items-center gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink-muted" title={h.name}>
                  {h.name}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    h.status === "Failed" ? "text-red-400" : "text-emerald-400/80"
                  }`}
                  title={h.status === "Failed" ? h.fail_message : undefined}
                >
                  {h.status === "Failed" ? "Failed" : h.size}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
