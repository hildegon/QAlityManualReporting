import { useEffect, useRef, useState } from "react";
import { CheckCircle, Info, AlertTriangle, XCircle, X } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/components/ui/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItemProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

const CONFIG: Record<
  ToastType,
  { icon: React.ElementType; wrapperCls: string; iconCls: string }
> = {
  success: {
    icon: CheckCircle,
    wrapperCls:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    iconCls: "text-emerald-500 dark:text-emerald-400",
  },
  error: {
    icon: XCircle,
    wrapperCls:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
    iconCls: "text-red-500 dark:text-red-400",
  },
  info: {
    icon: Info,
    wrapperCls:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300",
    iconCls: "text-blue-500 dark:text-blue-400",
  },
  warning: {
    icon: AlertTriangle,
    wrapperCls:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    iconCls: "text-amber-500 dark:text-amber-400",
  },
};

/** Single animated toast item. Auto-dismisses after 5 s for warnings, 3 s otherwise. */
function ToastItem({ id, message, type, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);
  const cfg = CONFIG[type];
  const Icon = cfg.icon;
  const duration = type === "warning" || type === "error" ? 5_000 : 3_000;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const removeTimer = setTimeout(() => {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        onDismiss(id);
      }
    }, duration + 300);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [id, duration, onDismiss]);

  const handleDismiss = () => {
    if (!dismissedRef.current) {
      dismissedRef.current = true;
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg",
        "transition-all duration-300 ease-in-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        cfg.wrapperCls,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.iconCls)} aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Global toast notification list anchored at the bottom-right of the viewport.
 * Reads from `useUiStore` — add toasts anywhere via `useUiStore(s => s.addToast)`.
 */
export function GlobalToastList() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          message={t.message}
          type={t.type}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}
