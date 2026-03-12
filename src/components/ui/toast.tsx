import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/utils";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

interface ToastItemProps {
  message: ToastMessage;
  onDismiss: (id: number) => void;
}

/** A single animated toast item. Auto-dismisses after 3 s. */
function ToastItem({ message, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  // Track whether the exit animation has started so we can call onDismiss once.
  const dismissedRef = useRef(false);

  // Enter: trigger the transition on the next frame after mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Exit: start fade-out after 3 s, then remove from DOM after 300 ms transition.
  useEffect(() => {
    const hideTimer = setTimeout(() => setVisible(false), 3000);
    const removeTimer = setTimeout(() => {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        onDismiss(message.id);
      }
    }, 3300); // 3000 ms display + 300 ms transition
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [message.id, onDismiss]);

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm font-medium shadow-lg",
        "transition-all duration-300 ease-in-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
      )}
    >
      {message.text}
    </div>
  );
}

interface ToastProps {
  /** Single-message API for backward-compat: pass a ToastMessage or null. */
  message: ToastMessage | null;
}

/**
 * Transient toast notification stack that auto-dismisses after 3 s.
 * Accepts a single `message` prop (backward-compatible with existing callers).
 * New messages are pushed onto a queue so rapid calls don't overwrite each other.
 *
 * Usage:
 *   const [toast, setToast] = useState<ToastMessage | null>(null);
 *   showToast(setToast, "Done!", "success");
 *   <Toast message={toast} />
 */
export function Toast({ message }: ToastProps) {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const lastIdRef = useRef<number | null>(null);

  // Push incoming message onto the queue (deduplicate by id).
  useEffect(() => {
    if (!message) return;
    if (message.id === lastIdRef.current) return;
    lastIdRef.current = message.id;
    setQueue((q) => [...q, message]);
  }, [message]);

  const handleDismiss = (id: number) => {
    setQueue((q) => q.filter((m) => m.id !== id));
  };

  if (queue.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {queue.map((m) => (
        <ToastItem key={m.id} message={m} onDismiss={handleDismiss} />
      ))}
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
