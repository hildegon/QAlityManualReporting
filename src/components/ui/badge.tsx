import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-800",
        pass: "bg-emerald-100 text-emerald-800",
        fail: "bg-red-100 text-red-800",
        todo: "bg-slate-100 text-slate-600",
        executing: "bg-blue-100 text-blue-800",
        blocked: "bg-amber-100 text-amber-800",
        outline: "border border-slate-200 text-slate-700",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps an Xray test status name to a Badge variant. */
export function statusVariant(status: string): VariantProps<typeof badgeVariants>["variant"] {
  switch (status.toUpperCase()) {
    case "PASS":
    case "PASSED":
      return "pass";
    case "FAIL":
    case "FAILED":
      return "fail";
    case "EXECUTING":
      return "executing";
    case "BLOCKED":
      return "blocked";
    case "TODO":
    default:
      return "todo";
  }
}
