import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig, useSaveConfig } from "@/services/queries";
import { validateJiraCredentials, authenticateXray } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle, ExternalLink, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import type { AppConfig } from "@/types";
import { PageHelpButton } from "@/components/common/PageHelpModal";
import {
  useUserRoleStore,
  getDefaultRoute,
} from "@/stores/userRoleStore";
import type { UserRole } from "@/stores/userRoleStore";
import { cn } from "@/components/ui/utils";
import { ApiUsageTab } from "@/components/settings/ApiUsageTab";

type SettingsTab = "configuration" | "api-usage";

const EMPTY_CONFIG: AppConfig = {
  jira_url: "",
  jira_email: "",
  jira_api_token: "",
  xray_client_id: "",
  xray_client_secret: "",
};

type ValidationState = "idle" | "loading" | "success" | "error";

export function SettingsPage() {
  const { data: savedConfig, isLoading } = useConfig();
  const saveConfig = useSaveConfig();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("configuration");

  const userRole = useUserRoleStore((s) => s.userRole);
  const setUserRole = useUserRoleStore((s) => s.setUserRole);

  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);

  function handleRoleClick(role: UserRole) {
    if (role === userRole) return;
    setPendingRole(role);
  }

  function confirmRoleChange() {
    if (!pendingRole) return;
    setUserRole(pendingRole);
    navigate(getDefaultRoute(pendingRole), { replace: true });
    setPendingRole(null);
  }

  function cancelRoleChange() {
    setPendingRole(null);
  }

  const [form, setForm] = useState<AppConfig>(EMPTY_CONFIG);
  const [jiraValidation, setJiraValidation] = useState<ValidationState>("idle");
  const [xrayValidation, setXrayValidation] = useState<ValidationState>("idle");
  const [jiraUser, setJiraUser] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Populate form when saved config loads
  useEffect(() => {
    if (savedConfig) setForm(savedConfig);
  }, [savedConfig]);

  // Load app version
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  const handleChange = (key: keyof AppConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSave = () => {
    saveConfig.mutate(form, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: ["xray"] });
        queryClient.removeQueries({ queryKey: ["jira"] });
        queryClient.removeQueries({ queryKey: ["version-run-stats"] });
      },
    });
  };

  const handleValidateJira = async () => {
    setJiraValidation("loading");
    setErrorMsg(null);
    try {
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
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Settings</h1>
        <PageHelpButton pageId="settings" />
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        {([
          { id: "configuration" as const, label: "Configuration" },
          { id: "api-usage" as const, label: "API Usage" },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "configuration" && (
        <>
          {/* User Role section */}
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              User Role
            </h2>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
              Controls which sections of the app are accessible to you.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["QA", "Product", "Developer", "Design"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleClick(role)}
                  className={cn(
                    "rounded-md border px-4 py-1.5 text-sm transition-colors",
                    userRole === role
                      ? "border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-500"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-600",
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </section>

          {/* Jira section */}
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
              <Field
                label="API Token"
                hint={
                  <button
                    type="button"
                    onClick={() =>
                      void openUrl("https://id.atlassian.com/manage-profile/security/api-tokens")
                    }
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Create an API token on Atlassian
                  </button>
                }
              >
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
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Xray Cloud
            </h2>

            <div className="space-y-4">
              <Field
                label="Client ID"
                hint={
                  <button
                    type="button"
                    onClick={() =>
                      void openUrl(
                        "https://docs.getxray.app/space/XRAYCLOUD/44568019/Global+Settings+-+API+Keys",
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Find your API keys in Xray Cloud settings
                  </button>
                }
              >
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
            <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {errorMsg}
            </p>
          )}

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? <Spinner size="sm" /> : "Save settings"}
          </Button>

          {saveConfig.isSuccess && (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Settings saved.</p>
          )}

          {appVersion && (
            <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">Version {appVersion}</p>
          )}
        </>
      )}

      {activeTab === "api-usage" && <ApiUsageTab />}

      {/* Role change confirmation modal */}
      {pendingRole !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-1 text-2xl">🐱</div>
            <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              Are you sure about this?
            </h2>
            <p className="mb-1 text-sm text-slate-600 dark:text-slate-300">
              You are about to switch to the{" "}
              <span className="font-semibold text-blue-500">{pendingRole}</span> role.
            </p>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
              Please only select the role that truly represents you. Lying about your role is not
              just bad practice — every time someone picks the wrong role,{" "}
              <span className="font-medium text-red-500">a kitten dies</span>. 🙏
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelRoleChange}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmRoleChange}>
                I am truly a {pendingRole}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
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
      <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
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

export default SettingsPage;

