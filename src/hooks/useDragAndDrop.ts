import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Minimal mouse-based drag-and-drop engine for Tauri (macOS WKWebView).
 *
 * HTML5 DnD does not work reliably in Tauri's WebView because macOS
 * intercepts native drag events at the WKWebView level. This hook
 * implements the same behaviour using mousedown → mousemove → mouseup
 * with a floating ghost element rendered by the caller.
 *
 * @param dropTargetRefs  A ref-map from target-id → DOM element. The hook
 *                        performs hit-testing against these elements on every
 *                        mouse-move and calls `onDrop` when the mouse is
 *                        released over one of them.
 * @param onDrop          Called with (ids, targetId) when a drag ends over a
 *                        valid target.
 *
 * @returns
 *   - `drag`           Current drag state, or null when idle. Pass to your
 *                      `<DragGhost drag={drag} />` component.
 *   - `hoveredTargetId` The drop-target currently under the cursor, or null.
 *   - `startDrag`      Call this from an item's `onMouseDown` handler, passing
 *                      the ids being dragged and the mouse event.
 */
export interface DragState {
  ids: string[];
  x: number;
  y: number;
}

export function useDragAndDrop(
  dropTargetRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  onDrop: (ids: string[], targetId: string) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const startDrag = useCallback((ids: string[], e: React.MouseEvent) => {
    e.preventDefault();
    const state: DragState = { ids, x: e.pageX, y: e.pageY };
    dragRef.current = state;
    setDrag(state);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const next: DragState = { ...dragRef.current, x: e.pageX, y: e.pageY };
      dragRef.current = next;
      setDrag(next);

      // Hit-test all registered drop targets.
      let hit: string | null = null;
      for (const [id, el] of dropTargetRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          hit = id;
          break;
        }
      }
      setHoveredTargetId(hit);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const ids = dragRef.current.ids;

      // Find the target under the cursor.
      let hit: string | null = null;
      for (const [id, el] of dropTargetRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          hit = id;
          break;
        }
      }

      dragRef.current = null;
      setDrag(null);
      setHoveredTargetId(null);

      if (hit) onDrop(ids, hit);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dropTargetRefs, onDrop]);

  return { drag, hoveredTargetId, startDrag };
}
