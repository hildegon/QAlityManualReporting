import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SettingsPage } from "@/pages/SettingsPage";
import { TestExecutionsPage } from "@/pages/TestExecutionsPage";
import { TestPlansPage } from "@/pages/TestPlansPage";
import { TestSetsPage } from "@/pages/TestSetsPage";
import { CreateTestPage } from "@/pages/CreateTestPage";
import { useUiStore, parseRateLimitError } from "@/stores/uiStore";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Never retry rate-limited requests — wait for the block to lift instead.
          if (parseRateLimitError(error) !== null) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: (failureCount, error) => {
          if (parseRateLimitError(error) !== null) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
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
  queryClient.getQueryCache().config.onError = (error) => {
    const until = parseRateLimitError(error);
    if (until !== null) setRateLimit(until);
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
              <Route path="/create-test" element={<CreateTestPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
