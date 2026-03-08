import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

type Theme = "light" | "dark";

const THEME_KEY = "qality-theme";

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable
  }
  return "light";
}

interface UiState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
  /** Epoch-millisecond timestamp at which an active rate-limit block lifts, or null. */
  rateLimitUntil: number | null;
  /** Epoch-millisecond timestamp at which the current rate-limit block started, or null. */
  rateLimitStart: number | null;
  setRateLimit: (untilMs: number | null) => void;
  /** Current colour theme. */
  theme: Theme;
  /** Toggle between light and dark, persisting the choice to localStorage. */
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  addToast: (message, type = "info") =>
    set((state) => ({
      toasts: [...state.toasts, { id: `${Date.now()}-${Math.random()}`, message, type }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  rateLimitUntil: null,
  rateLimitStart: null,
  setRateLimit: (untilMs) =>
    set((state) => ({
      rateLimitUntil: untilMs,
      // Capture start time only when a new limit is set; clear it when dismissed.
      rateLimitStart: untilMs !== null ? (state.rateLimitStart ?? Date.now()) : null,
    })),
  theme: loadTheme(),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // localStorage unavailable
      }
      return { theme: next };
    }),
}));

/**
 * Parse a Tauri error string for a rate-limit signal emitted by the Rust backend.
 * Returns the unblock epoch-ms if found, or `null` otherwise.
 *
 * The Rust backend emits:
 *   "RATE_LIMITED:<epoch_ms>"  — when a Retry-After / X-RateLimit-Reset header was present
 *   "RATE_LIMITED"             — when no timing header was present (fall back to 60 s)
 */
export function parseRateLimitError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const idx = msg.indexOf("RATE_LIMITED");
  if (idx === -1) return null;
  const rest = msg.slice(idx + "RATE_LIMITED".length);
  if (rest.startsWith(":")) {
    const ms = parseInt(rest.slice(1), 10);
    if (!Number.isNaN(ms)) return ms;
  }
  // No timestamp — fall back to 60 seconds from now.
  return Date.now() + 60_000;
}
