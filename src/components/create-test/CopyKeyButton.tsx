import { useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";
import { cn } from "@/components/ui/utils";

export function CopyKeyButton({ keyValue }: { keyValue: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`Copy ${keyValue}`}
      title={copied ? "Copied!" : `Copy ${keyValue}`}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
      )}
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
