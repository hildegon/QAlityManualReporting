import { useState } from "react";
import { Pencil, Zap } from "lucide-react";
import { useGetTestSets, useProjectComponents } from "@/services/queries";
import { useContentProjectKey } from "@/hooks/useProjectKey";
import { cn } from "@/components/ui/utils";
import { ManualTestCreationForm } from "@/components/create-test/ManualTestCreationForm";
import { BulkTestCreationPanel } from "@/components/create-test/BulkTestCreationPanel";
import { UpdateManualTestPanel } from "@/components/create-test/UpdateManualTestPanel";
import { PageHelpButton } from "@/components/common/PageHelpModal";

export function CreateTestPage() {
  const projectKey = useContentProjectKey();
  const [activeTab, setActiveTab] = useState<"manual" | "bulk" | "update">("manual");

  const { data: testSets, isLoading: testSetsLoading } = useGetTestSets(projectKey ?? undefined);
  const {
    data: components,
    isLoading: componentsLoading,
    isError: componentsError,
  } = useProjectComponents(projectKey);

  const jiraConfigured = !componentsError;

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Set a Project Key in Settings to create tests.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", activeTab !== "update" && "mx-auto max-w-3xl")}>
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {activeTab === "update" ? "Update Manual Test" : "Create Test"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {activeTab === "update"
              ? "Edit step definitions for manual tests in Xray project "
              : "Creates tests in Xray for project "}
            <span className="font-medium text-slate-700 dark:text-slate-200">{projectKey}</span>.
          </p>
        </div>
        <PageHelpButton pageId="create-test" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={cn(
              "pb-2 text-sm font-medium transition-colors",
              activeTab === "manual"
                ? "border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors",
              activeTab === "bulk"
                ? "border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Automated (Bulk)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("update")}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-medium transition-colors",
              activeTab === "update"
                ? "border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            Update
          </button>
        </nav>
      </div>

      {activeTab === "manual" && (
        <ManualTestCreationForm
          projectKey={projectKey}
          testSets={testSets}
          testSetsLoading={testSetsLoading}
          components={components}
          componentsLoading={componentsLoading}
          jiraConfigured={jiraConfigured}
        />
      )}

      {activeTab === "bulk" && (
        <BulkTestCreationPanel
          projectKey={projectKey}
          testSets={testSets}
          testSetsLoading={testSetsLoading}
          components={components}
          componentsLoading={componentsLoading}
          jiraConfigured={jiraConfigured}
        />
      )}

      {activeTab === "update" && (
        <UpdateManualTestPanel projectKey={projectKey} />
      )}
    </div>
  );
}

export default CreateTestPage;
