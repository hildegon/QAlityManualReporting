import { useEffect, useState } from "react";
import { cn } from "@/components/ui/utils";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

interface ToastProps {
  message: ToastMessage | null;
}

/**
 * Transient toast notification that auto-dismisses after 3 seconds.
 * Shared between TestsPage and TestPlansPage.
 *
 * Usage:
 *   const [toast, setToast] = useState<ToastMessage | null>(null);
 *   showToast(setToast, "Done!", "success");
 *   <Toast message={toast} />
 */
export function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [message]);

  if (!message || !visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all",
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
      )}
    >
      {message.text}
    </div>
  );
}

/** Helper to trigger a toast; pass the setState setter from the parent. */
export function showToast(
  setToast: React.Dispatch<React.SetStateAction<ToastMessage | null>>,
  text: string,
  type: "success" | "error" = "success",
) {
  setToast({ id: Date.now(), text, type });
}

export type { ToastMessage };
