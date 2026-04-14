import { useNavigate } from "react-router-dom";
import { FlaskConical, BarChart2, Tag, Palette } from "lucide-react";
import { useUserRoleStore, getDefaultRoute } from "@/stores/userRoleStore";
import type { UserRole } from "@/stores/userRoleStore";
import { cn } from "@/components/ui/utils";

interface RoleOption {
  role: UserRole;
  icon: React.ElementType;
  description: string;
}

const ROLES: RoleOption[] = [
  {
    role: "QA",
    icon: FlaskConical,
    description: "Full access — executions, test plans, tests, coverage, and versions.",
  },
  {
    role: "Product",
    icon: BarChart2,
    description: "Coverage dashboard and version tracking.",
  },
  {
    role: "Developer",
    icon: Tag,
    description: "Version tracking and release readiness.",
  },
  {
    role: "Design",
    icon: Palette,
    description: "Version tracking and release readiness.",
  },
];

export function RoleSelectionModal() {
  const setUserRole = useUserRoleStore((s) => s.setUserRole);
  const navigate = useNavigate();

  function handleSelect(role: UserRole) {
    setUserRole(role);
    navigate(getDefaultRoute(role), { replace: true });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Welcome to QAlity
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Select your role to get a tailored experience.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {ROLES.map(({ role, icon: Icon, description }) => (
            <button
              key={role}
              type="button"
              onClick={() => handleSelect(role)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left",
                "transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                "dark:border-slate-600 dark:bg-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-600",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                <span className="font-medium text-slate-900 dark:text-slate-100">{role}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
