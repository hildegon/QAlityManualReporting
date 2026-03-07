import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SettingsPage } from "@/pages/SettingsPage";
import { TestExecutionsPage } from "@/pages/TestExecutionsPage";
import { TestPlansPage } from "@/pages/TestPlansPage";
import { TestSetsPage } from "@/pages/TestSetsPage";
import { CreateTestPage } from "@/pages/CreateTestPage";
import { VersionsPage } from "@/pages/VersionsPage";
import { useUiStore, parseRateLimitError } from "@/stores/uiStore";

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

const queryClient = makeQueryClient();

export default function App() {
  const setRateLimit = useUiStore((s) => s.setRateLimit);

  // Register a global error observer so any query or mutation that fails with a
  // rate-limit error immediately shows the banner — even for errors that TanStack
  // Query silently swallows (e.g. background refetches).
  // The query/mutation will automatically retry once after the window expires
  // (configured in retryDelay above); we also schedule an invalidation so that
  // any queries that already exhausted their retry budget get a second chance.
  queryClient.getQueryCache().config.onError = (error) => {
    const until = parseRateLimitError(error);
    if (until !== null) {
      setRateLimit(until);
      const delay = Math.max(0, until - Date.now()) + 500;
      setTimeout(() => {
        void queryClient.invalidateQueries();
      }, delay);
    }
  };
  queryClient.getMutationCache().config.onError = (error) => {
    const until = parseRateLimitError(error);
    if (until !== null) setRateLimit(until);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/executions" replace />} />
              <Route path="/executions" element={<TestExecutionsPage />} />
              <Route path="/test-plans" element={<TestPlansPage />} />
              <Route path="/test-sets" element={<TestSetsPage />} />
              <Route path="/versions" element={<VersionsPage />} />
              <Route path="/create-test" element={<CreateTestPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
