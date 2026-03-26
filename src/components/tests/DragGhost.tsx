import { GripVertical } from "lucide-react";
import type { DragState } from "@/hooks/useDragAndDrop";

export function DragGhost({
  drag,
  ghostRef,
}: {
  drag: DragState;
  ghostRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={ghostRef}
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-xs font-medium text-white shadow-lg"
      style={{ left: drag.x + 12, top: drag.y - 14 }}
    >
      <GripVertical className="h-3 w-3 opacity-60" />
      {drag.ids.length} test{drag.ids.length !== 1 ? "s" : ""}
    </div>
  );
}
