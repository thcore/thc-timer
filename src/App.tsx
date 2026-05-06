import { useEffect, useMemo, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; received: number; total: number | null }
  | { kind: "installing"; update: Update }
  | { kind: "error"; message: string };

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
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });

  // Tick.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // Persist runtime state so closing the app doesn't lose progress.
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

  // Auto-advance pomodoro when phase ends.
  useEffect(() => {
    if (mode !== "pomodoro" || !running || remainingMs == null) return;
    if (remainingMs > 0) return;
    finishPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, mode, running]);

  function commitSession(extra?: Partial<Session>) {
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
      ...extra,
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
    // Snapshot final elapsed before zeroing.
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
    // Soft notify; ignore failures (e.g. permission denied).
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

  // Ask for notification permission once for pomodoro alerts.
  useEffect(() => {
    if (mode === "pomodoro" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [mode]);

  // Read app version for display.
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  // Check for updates once on startup.
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
        setUpdateStatus({ kind: "available", update });
      } catch {
        if (!cancelled) setUpdateStatus({ kind: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function installUpdate(update: Update) {
    let received = 0;
    let total: number | null = null;
    setUpdateStatus({ kind: "downloading", update, received, total });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          setUpdateStatus({ kind: "downloading", update, received: 0, total });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setUpdateStatus({ kind: "downloading", update, received, total });
        } else if (event.event === "Finished") {
          setUpdateStatus({ kind: "installing", update });
        }
      });
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

  const totalsByLabel = useMemo(() => {
    const todayStart = startOfDay(Date.now());
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.endedAt < todayStart) continue;
      map.set(s.label, (map.get(s.label) ?? 0) + s.durationMs);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          thc·timer
          {appVersion && <span className="version">v{appVersion}</span>}
        </div>
        <div className="modes">
          <button
            className={mode === "stopwatch" ? "tab on" : "tab"}
            onClick={() => switchMode("stopwatch")}
          >
            stopwatch
          </button>
          <button
            className={mode === "pomodoro" ? "tab on" : "tab"}
            onClick={() => switchMode("pomodoro")}
          >
            pomodoro
          </button>
        </div>
      </header>

      <UpdateBanner
        status={updateStatus}
        onInstall={installUpdate}
        onDismiss={() => setUpdateStatus({ kind: "idle" })}
      />


      <section className="stage">
        {mode === "pomodoro" && (
          <div className="phaseRow">
            <span className={phase === "focus" ? "chip on" : "chip"}>focus</span>
            <span className={phase === "short" ? "chip on" : "chip"}>short break</span>
            <span className={phase === "long" ? "chip on" : "chip"}>long break</span>
            <span className="cycle">cycle {cycle}</span>
          </div>
        )}

        <div className={`clock ${mode === "pomodoro" && phase !== "focus" ? "break" : ""}`}>
          {display}
        </div>

        <input
          className="labelInput"
          placeholder={mode === "pomodoro" ? "What are you focusing on?" : "What are you working on?"}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <div className="controls">
          {!running ? (
            <button className="primary" onClick={start}>
              {accumulatedMs > 0 ? "resume" : "start"}
            </button>
          ) : (
            <button className="primary" onClick={pause}>
              pause
            </button>
          )}
          <button className="secondary" onClick={stop} disabled={!running && accumulatedMs === 0}>
            stop
          </button>
        </div>
      </section>

      <section className="summary">
        <div className="todayLine">
          <span className="muted">today</span>
          <strong>{fmtShort(todayMs)}</strong>
        </div>
        {totalsByLabel.length > 0 && (
          <ul className="byLabel">
            {totalsByLabel.slice(0, 4).map(([k, v]) => (
              <li key={k}>
                <span className="lbl">{k}</span>
                <span className="amt">{fmtShort(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="history">
        <div className="historyHead">
          <span>recent</span>
          {sessions.length > 0 && (
            <button className="link" onClick={clearHistory}>
              clear
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="empty">no sessions yet</div>
        ) : (
          <ul className="sessions">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id}>
                <span className="when">
                  {new Date(s.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="lbl">{s.label}</span>
                <span className={`tag tag-${s.mode}`}>{s.phase ?? s.mode}</span>
                <span className="amt">{fmtShort(s.durationMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function UpdateBanner({
  status,
  onInstall,
  onDismiss,
}: {
  status: UpdateStatus;
  onInstall: (u: Update) => void;
  onDismiss: () => void;
}) {
  if (status.kind === "idle" || status.kind === "checking") return null;

  if (status.kind === "available") {
    return (
      <div className="updateBanner">
        <div className="updateText">
          <strong>update available</strong>
          <span className="muted">v{status.update.version}</span>
        </div>
        <div className="updateActions">
          <button className="link" onClick={onDismiss}>
            later
          </button>
          <button className="updateBtn" onClick={() => onInstall(status.update)}>
            install
          </button>
        </div>
      </div>
    );
  }

  if (status.kind === "downloading") {
    const pct =
      status.total != null && status.total > 0
        ? Math.min(100, Math.round((status.received / status.total) * 100))
        : null;
    return (
      <div className="updateBanner">
        <div className="updateText">
          <strong>downloading v{status.update.version}…</strong>
          <span className="muted">{pct != null ? `${pct}%` : "starting"}</span>
        </div>
        <div className="progress">
          <div
            className="progressFill"
            style={{ width: pct != null ? `${pct}%` : "20%" }}
          />
        </div>
      </div>
    );
  }

  if (status.kind === "installing") {
    return (
      <div className="updateBanner">
        <div className="updateText">
          <strong>installing… app will restart</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="updateBanner err">
      <div className="updateText">
        <strong>update failed</strong>
        <span className="muted">{status.message}</span>
      </div>
      <button className="link" onClick={onDismiss}>
        dismiss
      </button>
    </div>
  );
}

