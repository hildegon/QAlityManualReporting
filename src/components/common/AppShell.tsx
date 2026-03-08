import { Outlet, NavLink } from "react-router-dom";
import {
  Settings,
  ListChecks,
  BookOpen,
  Activity,
  FilePlus2,
  Tag,
  FlaskConical,
} from "lucide-react";
import { ProjectSelector } from "./ProjectSelector";
import { RateLimitBanner } from "./RateLimitBanner";
import { ThemeToggle } from "./ThemeToggle";
import { useConfig } from "@/services/queries";
import { cn } from "@/components/ui/utils";

const navItems = [
  { to: "/executions", label: "Executions", icon: ListChecks },
  { to: "/test-plans", label: "Test Plans", icon: BookOpen },
  { to: "/tests", label: "Tests", icon: FlaskConical },
  { to: "/coverage", label: "Coverage", icon: Activity },
  { to: "/versions", label: "Versions", icon: Tag },
  { to: "/create-test", label: "Create Test", icon: FilePlus2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { data: config } = useConfig();
  const isJiraConfigured = !!config?.jira_url && !!config.jira_email && !!config.jira_api_token;

  const contentKey = config?.content_project_key || null;
  const contentName = config?.content_project_name || contentKey;
  const executionKey = config?.execution_project_key || null;
  const executionName = config?.execution_project_name || executionKey;

  // Label shown when Jira is not configured (no interactive project selector).
  // Uses the stored project names, falling back to raw keys when names aren't set.
  const projectLabel = (() => {
    if (!contentName && !executionName) return null;
    if (contentName && executionName && contentKey !== executionKey)
      return `${contentName} / ${executionName}`;
    return contentName || executionName;
  })();

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Top navigation bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            QAlity
          </span>
          {isJiraConfigured ? (
            <ProjectSelector />
          ) : projectLabel ? (
            <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {projectLabel}
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
                    ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
          <ThemeToggle />
        </nav>
      </header>

      {/* Rate-limit banner — shown below the nav bar when a 429 is active */}
      <RateLimitBanner />

      {/* Main content area */}
      <main className="min-h-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
