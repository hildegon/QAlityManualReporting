import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CoveragePreset {
  id: string;
  name: string;
  /** Ordered array of test-set issue IDs included in this preset. */
  setIds: string[];
  createdAt: number;
}

interface CoveragePresetsState {
  presets: CoveragePreset[];
  savePreset: (name: string, setIds: string[]) => CoveragePreset;
  updatePreset: (id: string, name: string, setIds: string[]) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
}

export const useCoveragePresetsStore = create<CoveragePresetsState>()(
  persist(
    (set) => ({
      presets: [],

      savePreset: (name, setIds) => {
        const preset: CoveragePreset = {
          id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim(),
          setIds,
          createdAt: Date.now(),
        };
        set((state) => ({ presets: [...state.presets, preset] }));
        return preset;
      },

      updatePreset: (id, name, setIds) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, name: name.trim(), setIds } : p,
          ),
        }));
      },

      deletePreset: (id) => {
        set((state) => ({ presets: state.presets.filter((p) => p.id !== id) }));
      },

      renamePreset: (id, name) => {
        set((state) => ({
          presets: state.presets.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
        }));
      },
    }),
    {
      name: "qality-coverage-presets",
    },
  ),
);
