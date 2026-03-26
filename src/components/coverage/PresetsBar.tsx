import { useState, useRef, useEffect } from "react";
import { BookmarkCheck, BookmarkPlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Input } from "@/components/ui/input";
import { useCoveragePresetsStore } from "@/stores/coveragePresetsStore";
import type { CoveragePreset } from "@/stores/coveragePresetsStore";

export interface PresetsBarProps {
  selectedSetIds: Set<string>;
  onLoad: (preset: CoveragePreset) => void;
  activePresetId: string | null;
  isModified: boolean;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function PresetsBar({
  selectedSetIds,
  onLoad,
  activePresetId,
  isModified,
  onSave,
  onUpdate,
  onDelete,
  onRename,
}: PresetsBarProps) {
  const presets = useCoveragePresetsStore((s) => s.presets);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the save-name input when it appears.
  useEffect(() => {
    if (saving) nameInputRef.current?.focus();
  }, [saving]);

  // Focus the rename input when it appears.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleSaveConfirm = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    setSaving(false);
  };

  const handleRenameConfirm = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue("");
  };

  const startRename = (preset: CoveragePreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
    setSaving(false);
  };

  const canSave = selectedSetIds.size > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookmarkCheck className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Presets</p>
        </div>

        {/* Save / Update buttons */}
        <div className="flex items-center gap-1.5">
          {activePresetId && isModified && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/40"
              title="Update current preset with the current selection"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              Update
            </button>
          )}
          {canSave && !saving && (
            <button
              onClick={() => {
                setSaving(true);
                setRenamingId(null);
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
              title="Save current selection as a new preset"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Inline name input for new preset */}
      {saving && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={nameInputRef}
            className="h-7 flex-1 text-xs"
            placeholder="Preset name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveConfirm();
              if (e.key === "Escape") {
                setSaving(false);
                setNewName("");
              }
            }}
          />
          <button
            onClick={handleSaveConfirm}
            disabled={!newName.trim()}
            className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setSaving(false);
              setNewName("");
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Preset chips */}
      {presets.length === 0 && !saving && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          {canSave ? 'Click "Save" to create your first preset.' : "No presets yet."}
        </p>
      )}

      {presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;

            if (renamingId === preset.id) {
              return (
                <div key={preset.id} className="flex items-center gap-1.5">
                  <Input
                    ref={renameInputRef}
                    className="h-7 flex-1 text-xs"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm(preset.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button
                    onClick={() => handleRenameConfirm(preset.id)}
                    disabled={!renameValue.trim()}
                    className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(null);
                      setRenameValue("");
                    }}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div key={preset.id} className="group flex items-center gap-1">
                <button
                  onClick={() => onLoad(preset)}
                  className={cn(
                    "flex flex-1 items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isActive && !isModified
                      ? "border-slate-700 bg-slate-700 font-semibold text-white"
                      : isActive && isModified
                        ? "border-amber-400 bg-amber-50 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700",
                  )}
                  title={`${preset.setIds.length} set${preset.setIds.length !== 1 ? "s" : ""}`}
                >
                  <span className="truncate">{preset.name}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      isActive && !isModified
                        ? "bg-white/20 text-white"
                        : isActive && isModified
                          ? "bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-300"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400",
                    )}
                  >
                    {preset.setIds.length}
                  </span>
                  {isActive && isModified && (
                    <span className="shrink-0 text-[10px] font-normal text-amber-600">
                      modified
                    </span>
                  )}
                </button>

                {/* Action icons (shown on hover) */}
                <button
                  onClick={() => startRename(preset)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100 dark:hover:bg-slate-700 dark:text-slate-400"
                  title="Rename preset"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDelete(preset.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30 dark:text-slate-400"
                  title="Delete preset"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
