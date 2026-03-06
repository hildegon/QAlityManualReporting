import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig, useSaveConfig } from "@/services/queries";
import { validateJiraCredentials, authenticateXray } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle, XCircle } from "lucide-react";
import type { AppConfig } from "@/types";

const EMPTY_CONFIG: AppConfig = {
  jira_url: "",
  jira_email: "",
  jira_api_token: "",
  xray_client_id: "",
  xray_client_secret: "",
  content_project_key: "",
  execution_project_key: "",
};

type ValidationState = "idle" | "loading" | "success" | "error";

export function SettingsPage() {
  const { data: savedConfig, isLoading } = useConfig();
  const saveConfig = useSaveConfig();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AppConfig>(EMPTY_CONFIG);
  const [jiraValidation, setJiraValidation] = useState<ValidationState>("idle");
  const [xrayValidation, setXrayValidation] = useState<ValidationState>("idle");
  const [jiraUser, setJiraUser] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Populate form when saved config loads
  useEffect(() => {
    if (savedConfig) setForm(savedConfig);
  }, [savedConfig]);

  const handleChange = (key: keyof AppConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSave = () => {
    saveConfig.mutate(form, {
      onSuccess: () => {
        // Invalidate Xray queries so data reloads with the new project key
        void queryClient.invalidateQueries({ queryKey: ["xray"] });
      },
    });
  };

  const handleValidateJira = async () => {
    setJiraValidation("loading");
    setErrorMsg(null);
    try {
      // Temporarily save so the Rust side can pick up the new values
      await saveConfig.mutateAsync(form);
      const displayName = await validateJiraCredentials();
      setJiraUser(displayName);
      setJiraValidation("success");
    } catch (err) {
      setJiraValidation("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleValidateXray = async () => {
    setXrayValidation("loading");
    setErrorMsg(null);
    try {
      await saveConfig.mutateAsync(form);
      await authenticateXray();
      setXrayValidation("success");
    } catch (err) {
      setXrayValidation("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>

      {/* Jira section */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Jira Cloud
        </h2>

        <div className="space-y-4">
          <Field label="Jira URL" hint="e.g. https://myorg.atlassian.net">
            <Input
              value={form.jira_url}
              onChange={handleChange("jira_url")}
              placeholder="https://myorg.atlassian.net"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.jira_email}
              onChange={handleChange("jira_email")}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="API Token" hint="Generate at id.atlassian.com/manage-profile/security">
            <Input
              type="password"
              value={form.jira_api_token}
              onChange={handleChange("jira_api_token")}
              placeholder="••••••••"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleValidateJira()}
            disabled={jiraValidation === "loading"}
          >
            {jiraValidation === "loading" ? <Spinner size="sm" /> : "Test connection"}
          </Button>
          <ValidationIndicator state={jiraValidation} successLabel={jiraUser ?? "Connected"} />
        </div>
      </section>

      {/* Xray section */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Xray Cloud
        </h2>

        <div className="space-y-4">
          <Field label="Client ID">
            <Input
              value={form.xray_client_id}
              onChange={handleChange("xray_client_id")}
              placeholder="Client ID from Xray API Keys"
            />
          </Field>
          <Field label="Client Secret">
            <Input
              type="password"
              value={form.xray_client_secret}
              onChange={handleChange("xray_client_secret")}
              placeholder="••••••••"
            />
          </Field>
          <Field label="Content Project Key" hint="Project for Test Plans, Test Sets, and Tests (e.g. PROJ)">
            <Input
              value={form.content_project_key}
              onChange={handleChange("content_project_key")}
              placeholder="PROJ"
            />
          </Field>
          <Field label="Execution Project Key" hint="Project for Test Executions — leave blank to use the same as above">
            <Input
              value={form.execution_project_key}
              onChange={handleChange("execution_project_key")}
              placeholder="EXEC (or leave blank)"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleValidateXray()}
            disabled={xrayValidation === "loading"}
          >
            {xrayValidation === "loading" ? <Spinner size="sm" /> : "Test connection"}
          </Button>
          <ValidationIndicator state={xrayValidation} successLabel="Authenticated" />
        </div>
      </section>

      {errorMsg && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</p>
      )}

      <Button onClick={handleSave} disabled={saveConfig.isPending}>
        {saveConfig.isPending ? <Spinner size="sm" /> : "Save settings"}
      </Button>

      {saveConfig.isSuccess && <p className="mt-3 text-sm text-emerald-600">Settings saved.</p>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ValidationIndicator({
  state,
  successLabel,
}: {
  state: ValidationState;
  successLabel: string;
}) {
  if (state === "success") {
    return (
      <span className="flex items-center gap-1 text-sm text-emerald-600">
        <CheckCircle className="h-4 w-4" />
        {successLabel}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-sm text-red-600">
        <XCircle className="h-4 w-4" />
        Failed
      </span>
    );
  }
  return null;
}
