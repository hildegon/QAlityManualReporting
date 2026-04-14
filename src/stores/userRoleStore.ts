import { create } from "zustand";

export type UserRole = "QA" | "Product" | "Developer" | "Design";

const ROLE_KEY = "qality-user-role";

const ROLE_ALLOWED_ROUTES: Record<UserRole, string[]> = {
  QA: ["/executions", "/test-plans", "/tests", "/create-test", "/coverage", "/versions", "/settings"],
  Product: ["/coverage", "/versions", "/settings"],
  Developer: ["/versions", "/settings"],
  Design: ["/versions", "/settings"],
};

const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  QA: "/executions",
  Product: "/coverage",
  Developer: "/versions",
  Design: "/versions",
};

export function getAllowedRoutes(role: UserRole): string[] {
  return ROLE_ALLOWED_ROUTES[role];
}

export function getDefaultRoute(role: UserRole): string {
  return ROLE_DEFAULT_ROUTE[role];
}

function loadRole(): UserRole | null {
  try {
    const stored = localStorage.getItem(ROLE_KEY);
    if (stored === "QA" || stored === "Product" || stored === "Developer" || stored === "Design") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return null;
}

interface UserRoleState {
  /** The current user role. Null means the role selection modal should be shown. */
  userRole: UserRole | null;
  setUserRole: (role: UserRole) => void;
}

export const useUserRoleStore = create<UserRoleState>((set) => ({
  userRole: loadRole(),
  setUserRole: (role) => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      // localStorage unavailable
    }
    set({ userRole: role });
  },
}));
