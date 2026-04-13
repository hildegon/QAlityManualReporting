import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/common/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Spinner } from "@/components/ui/spinner";
import { useUiStore, parseRateLimitError } from "@/stores/uiStore";

// Lazy-load page routes so each page's JS is only parsed when first navigated to.
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const TestExecutionsPage = lazy(() => import("@/pages/TestExecutionsPage"));
const CoveragePage = lazy(() => import("@/pages/CoveragePage"));
const TestPlansPage = lazy(() => import("@/pages/TestPlansPage"));
const TestsPage = lazy(() => import("@/pages/TestsPage"));
const CreateTestPage = lazy(() => import("@/pages/CreateTestPage"));
const VersionsPage = lazy(() => import("@/pages/VersionsPage"));

/**
 * How many times a query or mutation is allowed to retry on non-rate-limit errors.
 * Rate-limit errors get exactly one extra retry after the block window expires.
 */
const MAX_RETRIES = 2;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Rate-limited requests get one automatic retry (after the delay below).
          if (parseRateLimitError(error) !== null) return failureCount < 1;
          return failureCount < MAX_RETRIES;
        },
        retryDelay: (attempt, error) => {
          // For rate-limit errors, wait until the block is expected to lift.
          const until = parseRateLimitError(error);
          if (until !== null) return Math.max(0, until - Date.now()) + 500;
          return Math.min(1_000 * 2 ** attempt, 30_000);
        },
        refetchOnWindowFocus: false,
        // Queries tagged with persist:true use gcTime:Infinity on their own;
        // for everything else keep the default 5-minute garbage collection.
      },
      mutations: {
        retry: (failureCount, error) => {
          // Rate-limited mutations get one automatic retry after the block lifts.
          if (parseRateLimitError(error) !== null) return failureCount < 1;
          return failureCount < MAX_RETRIES;
        },
        retryDelay: (_attempt, error) => {
          const until = parseRateLimitError(error);
          if (until !== null) return Math.max(0, until - Date.now()) + 500;
          return 1_000;
        },
      },
    },
  });
}

/** Persister that writes to localStorage. Only queries with meta.persist === true are saved. */
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "qality-query-cache",
  /** Throttle writes to avoid thrashing localStorage on rapid query updates. */
  throttleTime: 5_000,
  // If localStorage is full, drop the persisted cache and continue without persistence.
  // Without a retry handler the persister silently fails and the cache is never saved.
  retry: ({ error, errorCount }) => {
    if (errorCount > 1) return undefined; // give up after one attempt
    if (import.meta.env.DEV) {
      console.warn("[QAlity] localStorage write failed, clearing cache and retrying:", error);
    }
    try {
      window.localStorage.removeItem("qality-query-cache");
    } catch {
      /* ignore */
    }
    return undefined; // let the next save succeed into empty storage
  },
});

const queryClient = makeQueryClient();

export default function App() {
  const setRateLimit = useUiStore((s) => s.setRateLimit);
  const addToast = useUiStore((s) => s.addToast);

  // Register global error observers once on mount so they are never re-assigned
  // on re-renders. Assigning directly in the render body would replace the
  // handler reference on every render cycle.
  // The query/mutation will automatically retry once after the window expires
  // (configured in retryDelay above); we also schedule an invalidation so that
  // any queries that already exhausted their retry budget get a second chance.
  // Only queries in an error state are invalidated — successful cached queries
  // are left alone to avoid a thundering herd when the rate limit lifts.
  useEffect(() => {
    // Listen for rate-limit events emitted by the Rust backend (Xray GraphQL).
    // The Rust side keeps retrying silently; this event just informs the user.
    let unlistenRateLimit: (() => void) | undefined;
    listen<{ until_ms: number }>("xray:rate-limited", (event) => {
      const until = event.payload.until_ms;
      const alreadyLimited = useUiStore.getState().rateLimitUntil !== null;
      setRateLimit(until);
      if (!alreadyLimited) {
        const secs = Math.max(1, Math.ceil((until - Date.now()) / 1_000));
        addToast(`Xray rate limit reached — retrying in ${secs}s`, "warning");
      }
    }).then((fn) => {
      unlistenRateLimit = fn;
    });

    queryClient.getQueryCache().config.onError = (error) => {
      const until = parseRateLimitError(error);
      if (until !== null) {
        const alreadyLimited = useUiStore.getState().rateLimitUntil !== null;
        setRateLimit(until);
        if (!alreadyLimited) {
          const secs = Math.max(1, Math.ceil((until - Date.now()) / 1_000));
          addToast(`API rate limit reached — requests paused for ${secs}s`, "warning");
        }
        const delay = Math.max(0, until - Date.now()) + 500;
        setTimeout(() => {
          // Stagger recovery: invalidate errored queries in small batches so we
          // don't hammer the API with a thundering herd the moment the rate limit
          // window expires.
          const errored = queryClient
            .getQueryCache()
            .findAll({ predicate: (q) => q.state.status === "error" });
          const BATCH = 4;
          const INTERVAL = 600; // ms between batches
          for (let i = 0; i < errored.length; i += BATCH) {
            const batch = errored.slice(i, i + BATCH);
            setTimeout(
              () => {
                batch.forEach((q) => {
                  void queryClient.invalidateQueries({ queryKey: q.queryKey });
                });
              },
              (i / BATCH) * INTERVAL,
            );
          }
        }, delay);
      }
    };
    queryClient.getMutationCache().config.onError = (error) => {
      const until = parseRateLimitError(error);
      if (until !== null) {
        const alreadyLimited = useUiStore.getState().rateLimitUntil !== null;
        setRateLimit(until);
        if (!alreadyLimited) {
          const secs = Math.max(1, Math.ceil((until - Date.now()) / 1_000));
          addToast(`API rate limit reached — requests paused for ${secs}s`, "warning");
        }
      }
    };
    return () => {
      unlistenRateLimit?.();
    };
  }, [setRateLimit, addToast]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        // Never expire the persisted cache — users control freshness via the Reload button.
        // The TanStack default is 24 hours, which would silently discard the cache after a day.
        maxAge: Infinity,
        // Only persist queries explicitly tagged with meta.persist === true.
        // This keeps credentials, test runs, and other sensitive/large data out of localStorage.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.meta?.persist === true,
        },
      }}
      onSuccess={() => {
        // Cache restored successfully — no action needed.
        // Use onError below to warn about failures.
      }}
      onError={() => {
        if (import.meta.env.DEV) {
          console.warn("[QAlity] Failed to restore query cache from localStorage");
        }
      }}
    >
      <ErrorBoundary>
        <HashRouter>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner className="h-6 w-6 text-slate-400" />
              </div>
            }
          >
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/executions" replace />} />
                <Route path="/executions" element={<TestExecutionsPage />} />
                <Route path="/coverage" element={<CoveragePage />} />
                <Route path="/test-plans" element={<TestPlansPage />} />
                <Route path="/tests" element={<TestsPage />} />
                <Route path="/versions" element={<VersionsPage />} />
                <Route path="/create-test" element={<CreateTestPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </ErrorBoundary>
    </PersistQueryClientProvider>
  );
}
