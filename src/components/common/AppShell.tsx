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

/** Stable className resolver for NavLink — defined at module level so it is never recreated. */
function navClassName({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors xl:px-3",
    isActive
      ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100"
      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200",
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Top navigation bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-4 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {/* Left: branding + project selectors */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            QAlity
          </span>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs font-medium text-slate-400 sm:inline dark:text-slate-500">
                Content
              </span>
              <ProjectSelector scope="content" />
            </div>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs font-medium text-slate-400 sm:inline dark:text-slate-500">
                Executions
              </span>
              <ProjectSelector scope="execution" />
            </div>
          </div>
        </div>

        {/* Right: nav links + theme toggle */}
        <nav className="flex items-center gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClassName} title={label}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden xl:inline">{label}</span>
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
