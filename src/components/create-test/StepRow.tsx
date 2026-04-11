import { GripVertical, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/utils";
import type { CreateTestStepInput } from "@/types";
import type { DraftStep } from "./types";

export type StepEditStatus = "unchanged" | "modified" | "new";

interface StepRowProps {
  step: DraftStep;
  index: number;
  total: number;
  disabled: boolean;
  editStatus?: StepEditStatus;
  onChange: (field: keyof CreateTestStepInput, value: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  /** Called when Tab is pressed on the Expected Result field (last step only). */
  onTabFromResult?: (() => void) | undefined;
}

export function StepRow({
  step,
  index,
  total,
  disabled,
  editStatus = "unchanged",
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onTabFromResult,
}: StepRowProps) {
  const borderClass =
    editStatus === "modified"
      ? "border-amber-300 dark:border-amber-600"
      : editStatus === "new"
        ? "border-emerald-300 dark:border-emerald-600"
        : "border-slate-200 dark:border-slate-700";

  const statusLabel =
    editStatus === "modified" ? (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        Modified
      </span>
    ) : editStatus === "new" ? (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        New
      </span>
    ) : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white shadow-sm transition-colors dark:bg-slate-800",
        borderClass,
        disabled && "opacity-60",
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp || disabled}
            aria-label="Move step up"
            className="rounded px-0.5 text-slate-300 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ▲
          </button>
          <GripVertical className="h-3.5 w-3.5 text-slate-300" />
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown || disabled}
            aria-label="Move step down"
            className="rounded px-0.5 text-slate-300 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ▼
          </button>
        </div>

        <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Step {index + 1}
          {total > 1 ? ` / ${total}` : ""}
        </span>
        {statusLabel}

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            disabled={disabled}
            aria-label="Duplicate step"
            title="Duplicate step"
            className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={total === 1 || disabled}
            aria-label="Remove step"
            className="h-7 w-7 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Step fields */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs text-slate-500 dark:text-slate-400">Action *</Label>
          <textarea
            data-step-id={step._id}
            value={step.action}
            onChange={(e) => onChange("action", e.target.value)}
            disabled={disabled}
            placeholder="What to do in this step"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500 dark:text-slate-400">Test Data</Label>
          <textarea
            value={step.data ?? ""}
            onChange={(e) => onChange("data", e.target.value)}
            disabled={disabled}
            placeholder="Input / test data (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-slate-500 dark:text-slate-400">Expected Result</Label>
          <textarea
            value={step.result ?? ""}
            onChange={(e) => onChange("result", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && onTabFromResult) {
                e.preventDefault();
                onTabFromResult();
              }
            }}
            disabled={disabled}
            placeholder="Expected outcome (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
