import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

export type PlanNote = {
  id: string;
  ts: number;
  text: string;
};

export type TimelinePlan = {
  id: string;
  label: string;
  startedAt: number;
  endedAt: number;
  notes?: PlanNote[];
};

type Props = {
  plans?: TimelinePlan[];
  onDeletePlan?: (id: string) => void;
  onSelectPlan?: (id: string) => void;
  selectedPlanId?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function assignLanes<T extends { startedAt: number; endedAt: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startedAt - b.startedAt);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startedAt);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endedAt);
    } else {
      laneEnds[lane] = item.endedAt;
    }
    return { item, lane };
  });
}

function progressOf(p: TimelinePlan, now: number) {
  if (now <= p.startedAt) return 0;
  if (now >= p.endedAt) return 1;
  return (now - p.startedAt) / (p.endedAt - p.startedAt);
}

const LANE_H = 22;
const LANE_GAP = 2;
const PAD = 3;
const MIN_TRACK_H = LANE_H;

export function Timeline({ plans = [], onDeletePlan, onSelectPlan, selectedPlanId }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dayStart = startOfDay(now);
  const dayEnd = dayStart + DAY_MS;
  const playheadPct = ((now - dayStart) / DAY_MS) * 100;

  const planLayout = useMemo(() => {
    const todayPlans = plans.filter(
      (p) => p.endedAt >= dayStart && p.startedAt < dayEnd,
    );
    const placed = assignLanes(todayPlans);
    const lanes = placed.reduce((m, x) => Math.max(m, x.lane + 1), 1);
    return { placed, lanes };
  }, [plans, dayStart, dayEnd]);

  const trackH = Math.max(
    MIN_TRACK_H,
    planLayout.lanes * LANE_H + (planLayout.lanes - 1) * LANE_GAP,
  );
  const timelineH = PAD + trackH + PAD;

  function pctRange(start: number, end: number) {
    const s = Math.max(start, dayStart);
    const e = Math.min(end, dayEnd);
    const left = ((s - dayStart) / DAY_MS) * 100;
    const width = ((e - s) / DAY_MS) * 100;
    return { left, width };
  }

  return (
    <section className="flex flex-col gap-[6px]">
      <div className="flex justify-between items-baseline text-muted text-xs lowercase tracking-wider px-1">
        <span>day</span>
        <span className="font-mono text-[11px] text-fg">{fmtTime(now)}</span>
      </div>

      <div
        className="relative bg-panel border border-border rounded-md overflow-hidden"
        style={{ height: `${timelineH}px` }}
      >
        {Array.from({ length: 23 }, (_, i) => {
          const h = i + 1;
          const major = h % 6 === 0;
          return (
            <div
              key={h}
              className={cn(
                "absolute top-0 bottom-0 w-px",
                major ? "bg-border" : "bg-border/40",
              )}
              style={{ left: `${(h / 24) * 100}%` }}
            />
          );
        })}

        {planLayout.placed.map(({ item: p, lane }) => {
          const { left, width } = pctRange(p.startedAt, p.endedAt);
          if (width <= 0) return null;
          const top = PAD + lane * (LANE_H + LANE_GAP);
          const selected = selectedPlanId === p.id;
          const noteCount = p.notes?.length ?? 0;
          const progress = progressOf(p, now);
          return (
            <div
              key={p.id}
              className={cn(
                "group absolute rounded-[3px] border border-dashed text-[10px] text-fg overflow-hidden flex items-center px-[5px] cursor-pointer transition-colors",
                selected
                  ? "border-accent border-solid"
                  : "border-muted/70 hover:border-muted",
              )}
              style={{
                top: `${top}px`,
                height: `${LANE_H}px`,
                left: `${left}%`,
                width: `${Math.max(width, 0.15)}%`,
              }}
              onClick={() => onSelectPlan?.(p.id)}
              title={`${p.label} · ${fmtTime(p.startedAt)}–${fmtTime(p.endedAt)}${noteCount ? ` · ${noteCount} note${noteCount > 1 ? "s" : ""}` : ""}`}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear",
                  selected ? "bg-accent/35" : "bg-accent/25",
                )}
                style={{ width: `${progress * 100}%` }}
              />
              <span className="relative truncate flex-1">{p.label}</span>
              {noteCount > 0 && (
                <span className="relative text-muted text-[9px] mx-[3px]">·{noteCount}</span>
              )}
              {onDeletePlan && (
                <button
                  className="relative opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-danger leading-none w-3 h-3 flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePlan(p.id);
                  }}
                  aria-label="Delete plan"
                  title="Delete plan"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-px bg-accent-strong pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="absolute -top-[2px] -left-[3px] w-[7px] h-[7px] rounded-full bg-accent-strong" />
        </div>
      </div>

      <div className="relative h-3 px-1">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute text-[9px] text-muted font-mono -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h.toString().padStart(2, "0")}
          </span>
        ))}
      </div>
    </section>
  );
}
