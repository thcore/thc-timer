import { useState } from "react";
import { Button } from "./ui/button";
import type { TimelinePlan, PlanNote } from "./timeline";

type Props = {
  plan: TimelinePlan;
  onAddNote: (planId: string, text: string) => void;
  onDeleteNote: (planId: string, noteId: string) => void;
  onClose: () => void;
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PlanNotes({ plan, onAddNote, onDeleteNote, onClose }: Props) {
  const [text, setText] = useState("");
  const notes: PlanNote[] = plan.notes ?? [];

  function add() {
    const t = text.trim();
    if (!t) return;
    onAddNote(plan.id, t);
    setText("");
  }

  return (
    <section className="flex flex-col gap-[6px] bg-panel border border-border rounded-md p-[10px]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-fg text-xs truncate">{plan.label}</span>
          <span className="font-mono text-muted text-[10px] shrink-0">
            {fmtTime(plan.startedAt)}–{fmtTime(plan.endedAt)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg text-[14px] leading-none w-4 h-4 flex items-center justify-center cursor-pointer"
          aria-label="Close notes"
          title="Close"
        >
          ×
        </button>
      </div>

      {notes.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-[2px] max-h-[110px] overflow-y-auto">
          {[...notes]
            .sort((a, b) => b.ts - a.ts)
            .map((n) => (
              <li
                key={n.id}
                className="group grid grid-cols-[44px_1fr_auto] gap-2 items-baseline px-1 py-[3px] rounded-sm text-[11px] hover:bg-panel-2"
              >
                <span className="font-mono text-muted text-[10px]">{fmtTime(n.ts)}</span>
                <span className="text-fg break-words">{n.text}</span>
                <button
                  onClick={() => onDeleteNote(plan.id, n.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-danger leading-none w-3 h-3 flex items-center justify-center cursor-pointer"
                  aria-label="Delete note"
                  title="Delete note"
                >
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex gap-[6px] items-center">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") onClose();
          }}
          placeholder="what are you doing right now?"
          className="flex-1 bg-panel-2 border border-border rounded-md px-2 py-1 text-[11px] text-fg outline-none placeholder:text-muted focus:border-accent"
        />
        <Button variant="primary" size="sm" onClick={add} disabled={!text.trim()}>
          log
        </Button>
      </div>
    </section>
  );
}
