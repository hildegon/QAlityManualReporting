import { Tag } from "lucide-react";
import { cn } from "@/components/ui/utils";

interface ComponentRowProps {
  name: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export function ComponentRow({ name, selected, disabled, onSelect }: ComponentRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors",
        selected ? "bg-slate-50 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        autoCorrect="off" autoCapitalize="off" spellCheck={false}
        type="radio"
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="h-4 w-4 border-slate-300 text-slate-900 accent-slate-800"
      />
      <Tag className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="truncate text-slate-700 dark:text-slate-300">{name}</span>
    </label>
  );
}
