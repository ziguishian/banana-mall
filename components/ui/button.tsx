import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:transform-none disabled:shadow-none",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,rgba(24,24,27,1),rgba(10,10,10,0.96))] text-primary-foreground shadow-[0_12px_28px_-16px_rgba(0,0,0,0.36)] hover:brightness-110 hover:shadow-[0_18px_36px_-18px_rgba(0,0,0,0.34)] dark:bg-[linear-gradient(180deg,rgba(250,250,250,1),rgba(231,231,231,0.96))] dark:text-black dark:hover:brightness-[1.03]",
        secondary:
          "border border-slate-200 bg-slate-100/85 text-secondary-foreground shadow-sm hover:border-slate-300 hover:bg-slate-100 hover:shadow-md dark:border-white/10 dark:bg-black/30 dark:text-slate-100 dark:hover:border-white/20 dark:hover:bg-white/8",
        outline:
          "border border-slate-200 bg-white/92 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md dark:border-white/10 dark:bg-black/30 dark:text-slate-100 dark:hover:border-white/20 dark:hover:bg-white/8 dark:hover:text-white",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md dark:bg-rose-600 dark:hover:bg-rose-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
