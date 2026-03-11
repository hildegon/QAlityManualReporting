import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional subtitle / Jira key shown below the title. */
  subtitle?: string;
  /** Max width class. Defaults to "max-w-lg". */
  maxWidth?: string;
  /** Max height class. Defaults to "max-h-[85vh]". */
  maxHeight?: string;
  children: React.ReactNode;
}

/**
 * Reusable Radix Dialog shell that provides the consistent header (title +
 * close button), scrollable body, and portal/overlay. Individual dialogs only
 * need to render their form content and footer inside this wrapper.
 *
 * Usage:
 *   <ModalShell open={open} onOpenChange={onOpenChange} title="New Execution">
 *     <div className="px-6 py-4">…body…</div>
 *     <div className="border-t px-6 py-4">…footer…</div>
 *   </ModalShell>
 */
export function ModalShell({
  open,
  onOpenChange,
  title,
  subtitle,
  maxWidth = "max-w-lg",
  maxHeight = "max-h-[85vh]",
  children,
}: ModalShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 flex ${maxHeight} w-full ${maxWidth} -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div>
              <Dialog.Title className="text-lg font-semibold dark:text-slate-100">{title}</Dialog.Title>
              {subtitle && (
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body / footer provided by the consumer */}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
