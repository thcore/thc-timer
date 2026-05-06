import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const chipVariants = cva(
  "text-[11px] tracking-wider lowercase px-[9px] py-[3px] rounded-full border transition-colors",
  {
    variants: {
      active: {
        true: "text-fg border-accent shadow-[0_0_0_1px_rgba(122,162,247,0.2)] bg-panel",
        false: "text-muted border-border bg-panel",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export type ChipProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof chipVariants>;

export function Chip({ className, active, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ active }), className)} {...props} />;
}
