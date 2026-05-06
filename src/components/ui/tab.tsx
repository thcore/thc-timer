import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const tabVariants = cva(
  "bg-transparent border-0 px-3 py-[5px] rounded-md text-xs font-inherit cursor-pointer transition-colors",
  {
    variants: {
      active: {
        true: "bg-panel-2 text-fg shadow-[inset_0_0_0_1px_var(--color-border)]",
        false: "text-muted hover:text-fg",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export interface TabProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof tabVariants> {}

export function Tab({ className, active, ...props }: TabProps) {
  return <button className={cn(tabVariants({ active }), className)} {...props} />;
}

export function TabsContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1 bg-panel p-[3px] rounded-lg border border-border">
      {children}
    </div>
  );
}
