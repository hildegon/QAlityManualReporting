import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

import { useIssueTransitions, useApplyTransition } from "@/services/queries";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import { categoryColor } from "./utils";

export interface TransitionMenuProps {
  issueKey: string;
  onToast: (msg: string, variant: "success" | "error") => void;
  /** Called after a transition is applied successfully, with the target status name. */
  onTransitioned?: (toStatusName: string) => void;
  /** Which side the dropdown opens toward. Default: right. */
  align?: "left" | "right";
  /** Extra class on the trigger button. */
  triggerClassName?: string | undefined;
}

export function TransitionMenu({
  issueKey,
  onToast,
  onTransitioned,
  align = "right",
  triggerClassName,
}: TransitionMenuProps) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: transitions, isLoading } = useIssueTransitions(open ? issueKey : null);
  const apply = useApplyTransition();

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropPos.top,
            ...(align === "right" ? { right: dropPos.right } : { left: dropPos.left }),
            zIndex: 9999,
          }}
          className="min-w-52 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Transition
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : !transitions?.length ? (
            <p className="px-3 py-3 text-xs italic text-slate-400">No transitions available.</p>
          ) : (
            <div className="py-1">
              {transitions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={apply.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    apply.mutate(
                      { issueKey, transitionId: t.id },
                      {
                        onSuccess: () => {
                          onToast(`${issueKey} → "${t.to.name}"`, "success");
                          onTransitioned?.(t.to.name);
                          setOpen(false);
                        },
                        onError: (err) => {
                          onToast(`Transition failed: ${String(err)}`, "error");
                        },
                      },
                    );
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>{t.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      categoryColor(t.to.category?.key),
                    )}
                  >
                    {t.to.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          calcPos();
          setOpen((p) => !p);
        }}
        aria-label="Actions"
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          open
            ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-600 dark:hover:text-slate-300",
          triggerClassName,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {dropdown}
    </div>
  );
}
