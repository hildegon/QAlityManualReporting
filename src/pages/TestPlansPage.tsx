import { useTestPlans } from "@/services/queries";
import { useProjectKey } from "@/hooks/useProjectKey";
import { Spinner } from "@/components/ui/spinner";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw } from "lucide-react";

export function TestPlansPage() {
  const projectKey = useProjectKey();
  const { data: plans, isLoading, isError, error, refetch, isFetching } = useTestPlans(projectKey);

  if (!projectKey) {
    return <EmptyState message="Set a Project Key in Settings to view test plans." />;
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 font-medium">Failed to load test plans</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{errorMessage}</pre>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Test Plans
          <span className="ml-2 text-sm font-normal text-slate-500">
            {projectKey} · {plans?.length ?? 0}
          </span>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>

      {!plans?.length ? (
        <EmptyState message={`No test plans found in ${projectKey}.`} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Key</th>
                <th className="px-4 py-3 text-left">Summary</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((plan) => (
                <tr key={plan.issue_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{plan.jira.key}</td>
                  <td className="px-4 py-3 text-slate-800">{plan.jira.summary}</td>
                  <td className="px-4 py-3">
                    {plan.jira.status && (
                      <Badge variant={statusVariant(plan.jira.status.name)}>
                        {plan.jira.status.name}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
      <BookOpen className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
