import { cva, type VariantProps } from "class-variance-authority";
import { type Update } from "@tauri-apps/plugin-updater";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; update: Update; received: number; total: number | null }
  | { kind: "ready"; update: Update }
  | { kind: "installing" }
  | { kind: "dismissed" }
  | { kind: "error"; message: string };

const bannerVariants = cva("flex flex-col gap-2 p-[10px_12px] rounded-[10px] border", {
  variants: {
    tone: {
      info:
        "bg-gradient-to-br from-[rgba(122,162,247,0.12)] to-[rgba(122,162,247,0.05)] border-[rgba(122,162,247,0.4)]",
      subtle: "bg-panel border-border p-[6px_10px] gap-1",
      error:
        "bg-[rgba(247,118,142,0.08)] border-[rgba(247,118,142,0.4)] flex-row items-center justify-between",
    },
  },
});

type BannerProps = VariantProps<typeof bannerVariants> & {
  className?: string;
  children: React.ReactNode;
};

function Banner({ tone, className, children }: BannerProps) {
  return <div className={cn(bannerVariants({ tone }), className)}>{children}</div>;
}

function ProgressBar({ pct }: { pct: number | null }) {
  return (
    <div className="h-1 bg-[rgba(122,162,247,0.15)] rounded-full overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-[width] duration-200"
        style={{ width: pct != null ? `${pct}%` : "10%" }}
      />
    </div>
  );
}

export function UpdateBanner({
  status,
  onApply,
  onDismiss,
}: {
  status: UpdateStatus;
  onApply: (u: Update) => void;
  onDismiss: () => void;
}) {
  if (status.kind === "idle" || status.kind === "checking" || status.kind === "dismissed") {
    return null;
  }

  if (status.kind === "downloading") {
    const pct =
      status.total != null && status.total > 0
        ? Math.min(100, Math.round((status.received / status.total) * 100))
        : null;
    return (
      <Banner tone="subtle">
        <div className="flex items-baseline justify-between text-[11px] text-muted">
          <span>downloading v{status.update.version}</span>
          <span>{pct != null ? `${pct}%` : "…"}</span>
        </div>
        <ProgressBar pct={pct} />
      </Banner>
    );
  }

  if (status.kind === "ready") {
    return (
      <Banner tone="info">
        <div className="flex items-baseline gap-[10px] text-[13px]">
          <strong>update ready</strong>
          <span className="text-muted text-xs lowercase tracking-wider">
            v{status.update.version} — restart to apply
          </span>
        </div>
        <div className="flex gap-2 items-center justify-end">
          <Button variant="ghost" size="link" onClick={onDismiss}>
            later
          </Button>
          <Button variant="accent" size="sm" onClick={() => onApply(status.update)}>
            restart now
          </Button>
        </div>
      </Banner>
    );
  }

  if (status.kind === "installing") {
    return (
      <Banner tone="info">
        <div className="flex items-baseline gap-[10px] text-[13px]">
          <strong>installing…</strong>
          <span className="text-muted text-xs lowercase tracking-wider">
            app will restart in a moment
          </span>
        </div>
      </Banner>
    );
  }

  return (
    <Banner tone="error">
      <div className="flex items-baseline gap-[10px] text-[13px]">
        <strong>update failed</strong>
        <span className="text-muted text-xs">{status.message}</span>
      </div>
      <Button variant="ghost" size="link" onClick={onDismiss}>
        dismiss
      </Button>
    </Banner>
  );
}
