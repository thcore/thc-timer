import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-inherit rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-strong text-bg border border-accent-strong font-semibold hover:bg-[#b6e08a] hover:border-[#b6e08a]",
        accent:
          "bg-accent text-bg border-0 font-semibold hover:bg-[#9bb8f9]",
        secondary:
          "bg-transparent text-fg border border-border hover:enabled:border-muted",
        ghost:
          "bg-transparent border-0 text-muted underline decoration-border hover:text-danger hover:decoration-danger p-0",
      },
      size: {
        md: "px-[22px] py-[9px] text-[13px] min-w-24",
        sm: "px-[14px] py-[5px] text-xs",
        link: "text-xs",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
