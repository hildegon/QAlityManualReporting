import { cn } from "@/components/ui/utils";
import { findSlice } from "@/components/charts/status-utils";

export interface StatusBadgeProps {
  name: string;
  color?: string;
}

export function StatusBadge({ name, color }: StatusBadgeProps) {
  const sl = findSlice(name);
  if (color && color.startsWith("#")) {
    return (
      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: color + "26", color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-xs font-semibold",
        sl.lightBg,
        sl.textClass,
      )}
    >
      {name}
    </span>
  );
}
