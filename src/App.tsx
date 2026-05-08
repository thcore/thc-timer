import { useEffect, useMemo, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "./components/ui/button";
import { Tab, TabsContainer } from "./components/ui/tab";
import { Chip } from "./components/ui/chip";
import { UpdateBanner, type UpdateStatus } from "./components/update-banner";
import { Timeline, type TimelinePlan, type PlanNote } from "./components/timeline";
import { PlanNotes } from "./components/plan-notes";
import { cn } from "./lib/utils";

type Mode = "stopwatch" | "pomodoro";
type Phase = "focus" | "short" | "long";

type Session = {
  id: string;
  label: string;
  mode: Mode;
  phase?: Phase;
  startedAt: number;
  endedAt: number;
  durationMs: number;
};

const POMO = {
  focus: 25 * 60 * 1000,
  short: 5 * 60 * 1000,
  long: 15 * 60 * 1000,
  cyclesBeforeLong: 4,
};

const SESSIONS_KEY = "thc-timer.sessions.v1";
const STATE_KEY = "thc-timer.state.v1";
const PLANS_KEY = "thc-timer.plans.v1";

function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function fmtShort(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(s: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(s));
}

function loadPlans(): TimelinePlan[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    return raw ? (JSON.parse(raw) as TimelinePlan[]) : [];
  } catch {
    return [];
  }
}

function savePlans(p: TimelinePlan[]) {
  localStorage.setItem(PLANS_KEY, JSON.stringify(p));
}

function timeStrToMs(today: number, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return today + h * 3_600_000 + mm * 60_000;
}

type Persisted = {
  mode: Mode;
  label: string;
  phase: Phase;
  cycle: number;
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
};

function loadState(): Persisted | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // Treat Monday as the first day of the week.
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export default function App() {
  const restored = useRef<Persisted | null>(loadState());
  const r = restored.current;

  const [mode, setMode] = useState<Mode>(r?.mode ?? "stopwatch");
  const [label, setLabel] = useState<string>(r?.label ?? "");
  const [phase, setPhase] = useState<Phase>(r?.phase ?? "focus");
  const [cycle, setCycle] = useState<number>(r?.cycle ?? 0);
  const [running, setRunning] = useState<boolean>(r?.running ?? false);
  const [startedAt, setStartedAt] = useState<number | null>(r?.startedAt ?? null);
  const [accumulatedMs, setAccumulatedMs] = useState<number>(r?.accumulatedMs ?? 0);
  const [now, setNow] = useState<number>(Date.now());
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [plans, setPlans] = useState<TimelinePlan[]>(() => loadPlans());
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [planStart, setPlanStart] = useState("09:00");
  const [planEnd, setPlanEnd] = useState("10:00");
  const [planLabel, setPlanLabel] = useState("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const s: Persisted = { mode, label, phase, cycle, running, startedAt, accumulatedMs };
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  }, [mode, label, phase, cycle, running, startedAt, accumulatedMs]);

  const elapsedMs = useMemo(() => {
    const live = running && startedAt ? now - startedAt : 0;
    return accumulatedMs + live;
  }, [running, startedAt, now, accumulatedMs]);

  const targetMs =
    mode === "pomodoro"
      ? phase === "focus"
        ? POMO.focus
        : phase === "short"
        ? POMO.short
        : POMO.long
      : null;

  const remainingMs = targetMs != null ? Math.max(0, targetMs - elapsedMs) : null;
  const display = mode === "pomodoro" ? fmt(remainingMs ?? 0) : fmt(elapsedMs);

  useEffect(() => {
    if (mode !== "pomodoro" || !running || remainingMs == null) return;
    if (remainingMs > 0) return;
    finishPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, mode, running]);

  function commitSession() {
    const dur = elapsedMs;
    if (dur < 1000) return;
    const s: Session = {
      id: crypto.randomUUID(),
      label: label.trim() || (mode === "pomodoro" ? phase : "untitled"),
      mode,
      phase: mode === "pomodoro" ? phase : undefined,
      startedAt: startedAt ?? Date.now() - dur,
      endedAt: Date.now(),
      durationMs: dur,
    };
    const next = [s, ...sessions].slice(0, 200);
    setSessions(next);
    saveSessions(next);
  }

  function start() {
    if (running) return;
    setStartedAt(Date.now());
    setRunning(true);
  }

  function pause() {
    if (!running) return;
    setAccumulatedMs((acc) => acc + (startedAt ? Date.now() - startedAt : 0));
    setStartedAt(null);
    setRunning(false);
  }

  function stop() {
    const finalMs = (running && startedAt ? Date.now() - startedAt : 0) + accumulatedMs;
    if (finalMs >= 1000) {
      const s: Session = {
        id: crypto.randomUUID(),
        label: label.trim() || (mode === "pomodoro" ? phase : "untitled"),
        mode,
        phase: mode === "pomodoro" ? phase : undefined,
        startedAt: (startedAt ?? Date.now()) - (running ? 0 : accumulatedMs),
        endedAt: Date.now(),
        durationMs: finalMs,
      };
      const next = [s, ...sessions].slice(0, 200);
      setSessions(next);
      saveSessions(next);
    }
    setRunning(false);
    setStartedAt(null);
    setAccumulatedMs(0);
    if (mode === "pomodoro") {
      setPhase("focus");
      setCycle(0);
    }
  }

  function finishPhase() {
    commitSession();
    setRunning(false);
    setStartedAt(null);
    setAccumulatedMs(0);
    if (phase === "focus") {
      const nextCycle = cycle + 1;
      setCycle(nextCycle);
      setPhase(nextCycle % POMO.cyclesBeforeLong === 0 ? "long" : "short");
    } else {
      setPhase("focus");
    }
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("thc-timer", {
          body: phase === "focus" ? "Focus done — break time" : "Break over — back to focus",
        });
      }
    } catch {
      /* noop */
    }
  }

  function switchMode(m: Mode) {
    if (running || accumulatedMs > 0) {
      const ok = confirm("Switching mode will discard the current timer. Continue?");
      if (!ok) return;
    }
    setRunning(false);
    setStartedAt(null);
    setAccumulatedMs(0);
    setPhase("focus");
    setCycle(0);
    setMode(m);
  }

  function clearHistory() {
    if (!confirm("Clear all session history?")) return;
    setSessions([]);
    saveSessions([]);
  }

  function deleteSession(id: string) {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    saveSessions(next);
  }

  function addPlan() {
    const text = planLabel.trim();
    if (!text) return;
    const today = startOfDay(Date.now());
    const s = timeStrToMs(today, planStart);
    const e = timeStrToMs(today, planEnd);
    if (s == null || e == null || e <= s) return;
    const p: TimelinePlan = {
      id: crypto.randomUUID(),
      label: text,
      startedAt: s,
      endedAt: e,
    };
    const next = [...plans, p];
    setPlans(next);
    savePlans(next);
    setPlanLabel("");
    setPlanFormOpen(false);
  }

  function deletePlan(id: string) {
    const next = plans.filter((p) => p.id !== id);
    setPlans(next);
    savePlans(next);
    if (selectedPlanId === id) setSelectedPlanId(null);
  }

  function addNote(planId: string, text: string) {
    const note: PlanNote = { id: crypto.randomUUID(), ts: Date.now(), text };
    const next = plans.map((p) =>
      p.id === planId ? { ...p, notes: [...(p.notes ?? []), note] } : p,
    );
    setPlans(next);
    savePlans(next);
  }

  function deleteNote(planId: string, noteId: string) {
    const next = plans.map((p) =>
      p.id === planId
        ? { ...p, notes: (p.notes ?? []).filter((n) => n.id !== noteId) }
        : p,
    );
    setPlans(next);
    savePlans(next);
  }

  useEffect(() => {
    if (mode === "pomodoro" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  // Check for updates and pre-download in the background on startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUpdateStatus({ kind: "checking" });
      try {
        const update = await check();
        if (cancelled) return;
        if (!update) {
          setUpdateStatus({ kind: "idle" });
          return;
        }
        let received = 0;
        let total: number | null = null;
        setUpdateStatus({ kind: "downloading", update, received, total });
        await update.download((event) => {
          if (cancelled) return;
          if (event.event === "Started") {
            total = event.data.contentLength ?? null;
            setUpdateStatus({ kind: "downloading", update, received: 0, total });
          } else if (event.event === "Progress") {
            received += event.data.chunkLength;
            setUpdateStatus({ kind: "downloading", update, received, total });
          }
        });
        if (cancelled) return;
        setUpdateStatus({ kind: "ready", update });
      } catch (err) {
        if (cancelled) return;
        setUpdateStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyUpdate(update: Update) {
    setUpdateStatus({ kind: "installing" });
    try {
      await update.install();
      await relaunch();
    } catch (err) {
      setUpdateStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const todayMs = useMemo(() => {
    const todayStart = startOfDay(Date.now());
    return sessions
      .filter((s) => s.endedAt >= todayStart)
      .reduce((sum, s) => sum + s.durationMs, 0);
  }, [sessions]);

  const weekMs = useMemo(() => {
    const weekStart = startOfWeek(Date.now());
    return sessions
      .filter((s) => s.endedAt >= weekStart)
      .reduce((sum, s) => sum + s.durationMs, 0);
  }, [sessions]);

  const totalsByLabel = useMemo(() => {
    const todayStart = startOfDay(Date.now());
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.endedAt < todayStart) continue;
      map.set(s.label, (map.get(s.label) ?? 0) + s.durationMs);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const isBreak = mode === "pomodoro" && phase !== "focus";

  return (
    <main className="flex flex-col h-screen px-[22px] pt-[18px] pb-[14px] gap-[14px]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs tracking-[0.12em] text-muted lowercase">
          thc·timer
          {appVersion && <span className="text-[10px] opacity-60 normal-case tracking-normal">v{appVersion}</span>}
        </div>
        <TabsContainer>
          <Tab active={mode === "stopwatch"} onClick={() => switchMode("stopwatch")}>
            stopwatch
          </Tab>
          <Tab active={mode === "pomodoro"} onClick={() => switchMode("pomodoro")}>
            pomodoro
          </Tab>
        </TabsContainer>
      </header>

      <UpdateBanner
        status={updateStatus}
        onApply={applyUpdate}
        onDismiss={() => setUpdateStatus({ kind: "dismissed" })}
      />

      <section className="flex flex-col items-center gap-[14px] pt-2 pb-[6px]">
        {mode === "pomodoro" && (
          <div className="flex gap-[6px] items-center">
            <Chip active={phase === "focus"}>focus</Chip>
            <Chip active={phase === "short"}>short break</Chip>
            <Chip active={phase === "long"}>long break</Chip>
            <span className="ml-[6px] font-mono text-[11px] text-muted">cycle {cycle}</span>
          </div>
        )}

        <div
          className={cn(
            "font-mono tabular-nums font-medium text-[76px] leading-none tracking-[-0.02em] py-1",
            isBreak ? "text-break" : "text-fg",
          )}
        >
          {display}
        </div>

        <input
          className="w-full max-w-[420px] bg-panel border border-border rounded-lg px-3 py-[9px] text-[13px] text-center text-fg outline-none placeholder:text-muted focus:border-accent focus:bg-panel-2 transition-colors"
          placeholder={
            mode === "pomodoro" ? "What are you focusing on?" : "What are you working on?"
          }
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <div className="flex gap-2">
          {!running ? (
            <Button variant="primary" onClick={start}>
              {accumulatedMs > 0 ? "resume" : "start"}
            </Button>
          ) : (
            <Button variant="primary" onClick={pause}>
              pause
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={stop}
            disabled={!running && accumulatedMs === 0}
          >
            stop
          </Button>
        </div>
      </section>

      <section className="flex items-baseline justify-between gap-4 px-3 py-2 bg-panel border border-border rounded-[10px]">
        <div className="flex gap-4 items-baseline">
          <div className="flex gap-2 items-baseline">
            <span className="text-muted text-xs lowercase tracking-wider">today</span>
            <strong className="font-mono text-base">{fmtShort(todayMs)}</strong>
          </div>
          <div className="flex gap-2 items-baseline">
            <span className="text-muted text-xs lowercase tracking-wider">week</span>
            <strong className="font-mono text-sm text-muted">{fmtShort(weekMs)}</strong>
          </div>
        </div>
        {totalsByLabel.length > 0 && (
          <ul className="flex gap-3 flex-wrap justify-end max-w-[60%] m-0 p-0 list-none">
            {totalsByLabel.slice(0, 4).map(([k, v]) => (
              <li key={k} className="flex gap-[6px] text-xs text-muted">
                <span className="text-fg max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {k}
                </span>
                <span className="font-mono">{fmtShort(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-[6px]">
        <Timeline
          plans={plans}
          onDeletePlan={deletePlan}
          onSelectPlan={(id) => setSelectedPlanId((cur) => (cur === id ? null : id))}
          selectedPlanId={selectedPlanId}
        />

        {planFormOpen ? (
          <div className="flex gap-[6px] items-center px-1">
            <input
              type="time"
              value={planStart}
              onChange={(e) => setPlanStart(e.target.value)}
              className="bg-panel border border-border rounded-md px-2 py-1 text-[11px] font-mono text-fg outline-none focus:border-accent"
            />
            <span className="text-muted text-[11px]">–</span>
            <input
              type="time"
              value={planEnd}
              onChange={(e) => setPlanEnd(e.target.value)}
              className="bg-panel border border-border rounded-md px-2 py-1 text-[11px] font-mono text-fg outline-none focus:border-accent"
            />
            <input
              autoFocus
              value={planLabel}
              onChange={(e) => setPlanLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPlan();
                if (e.key === "Escape") {
                  setPlanLabel("");
                  setPlanFormOpen(false);
                }
              }}
              placeholder="what's the plan?"
              className="flex-1 bg-panel border border-border rounded-md px-2 py-1 text-[11px] text-fg outline-none placeholder:text-muted focus:border-accent"
            />
            <Button variant="primary" size="sm" onClick={addPlan} disabled={!planLabel.trim()}>
              add
            </Button>
            <Button
              variant="ghost"
              size="link"
              onClick={() => {
                setPlanLabel("");
                setPlanFormOpen(false);
              }}
            >
              cancel
            </Button>
          </div>
        ) : (
          <div className="flex justify-end px-1">
            <Button variant="ghost" size="link" onClick={() => setPlanFormOpen(true)}>
              + plan
            </Button>
          </div>
        )}

        {selectedPlanId &&
          (() => {
            const sel = plans.find((p) => p.id === selectedPlanId);
            if (!sel) return null;
            return (
              <PlanNotes
                plan={sel}
                onAddNote={addNote}
                onDeleteNote={deleteNote}
                onClose={() => setSelectedPlanId(null)}
              />
            );
          })()}
      </div>

      <section className="flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center text-muted text-xs lowercase tracking-wider px-1 pb-[6px]">
          <span>recent</span>
          {sessions.length > 0 && (
            <Button variant="ghost" size="link" onClick={clearHistory}>
              clear
            </Button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="text-muted text-xs py-[14px] px-1 text-center">no sessions yet</div>
        ) : (
          <ul className="m-0 p-0 list-none overflow-y-auto flex flex-col gap-[2px]">
            {sessions.slice(0, 12).map((s) => (
              <SessionRow key={s.id} s={s} onDelete={() => deleteSession(s.id)} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SessionRow({ s, onDelete }: { s: Session; onDelete: () => void }) {
  const tagClass =
    s.mode === "pomodoro"
      ? "border-[rgba(122,162,247,0.4)] text-accent"
      : "border-[rgba(158,206,106,0.4)] text-accent-strong";
  return (
    <li className="group grid grid-cols-[56px_1fr_auto_auto_auto] gap-[10px] items-center px-[10px] py-[7px] rounded-md text-xs hover:bg-panel">
      <span className="font-mono text-muted text-[11px]">
        {new Date(s.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-fg overflow-hidden text-ellipsis whitespace-nowrap">{s.label}</span>
      <span
        className={cn(
          "text-[10px] lowercase px-[6px] py-[2px] rounded-full border tracking-wider",
          tagClass,
        )}
      >
        {s.phase ?? s.mode}
      </span>
      <span className="font-mono text-fg">{fmtShort(s.durationMs)}</span>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-0 text-muted hover:text-danger cursor-pointer text-[14px] leading-none w-5 h-5 flex items-center justify-center"
        onClick={onDelete}
        aria-label="Delete session"
        title="Delete this session"
      >
        ×
      </button>
    </li>
  );
}
