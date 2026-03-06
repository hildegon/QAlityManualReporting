import { Outlet, NavLink } from "react-router-dom";
import { Settings, ListChecks, BookOpen } from "lucide-react";
import { ProjectSelector } from "./ProjectSelector";
import { useConfig } from "@/services/queries";
import { cn } from "@/components/ui/utils";

const navItems = [
  { to: "/executions", label: "Executions", icon: ListChecks },
  { to: "/test-plans", label: "Test Plans", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { data: config } = useConfig();
  const isJiraConfigured = !!config?.jira_url && !!config.jira_email && !!config.jira_api_token;
  const projectKeyFromConfig = config?.project_key || null;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top navigation bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tracking-tight text-slate-800">QAlity</span>
          {isJiraConfigured ? (
            <ProjectSelector />
          ) : projectKeyFromConfig ? (
            <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
              {projectKeyFromConfig}
            </span>
          ) : null}
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main content area */}
      <main className="min-h-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
