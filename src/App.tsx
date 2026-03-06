import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SettingsPage } from "@/pages/SettingsPage";
import { TestExecutionsPage } from "@/pages/TestExecutionsPage";
import { TestPlansPage } from "@/pages/TestPlansPage";
import { TestSetsPage } from "@/pages/TestSetsPage";
import { CreateTestPage } from "@/pages/CreateTestPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
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
