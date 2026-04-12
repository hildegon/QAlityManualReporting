import { useState, useRef, useEffect, useMemo } from "react";
import { useJiraProjects } from "@/services/queries";
import { useProjectStore } from "@/stores/projectStore";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, FolderOpen, Search } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/components/ui/utils";
import type { JiraProject } from "@/types";

export type ProjectScope = "content" | "execution";

interface ProjectSelectorProps {
  /** Which independent project selection this instance controls. */
  scope: ProjectScope;
}

export function ProjectSelector({ scope }: ProjectSelectorProps) {
  const { data: projects, isLoading, isError } = useJiraProjects();
  const {
    activeContentProject,
    activeExecutionProject,
    setActiveContentProject,
    setActiveExecutionProject,
  } = useProjectStore();

  const activeProject: JiraProject | null =
    scope === "content" ? activeContentProject : activeExecutionProject;
  const setActiveProject =
    scope === "content" ? setActiveContentProject : setActiveExecutionProject;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search input whenever the dropdown opens.
  useEffect(() => {
    if (open) {
      // Slight delay so Radix has finished mounting the content before we focus.
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      setSearch("");
    }
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      !q || !projects
        ? (projects ?? [])
        : projects.filter(
            (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
          ),
    [projects, q],
  );

  if (isLoading) return <Spinner size="sm" />;
  if (isError || !projects?.length) {
    return <span className="text-sm text-slate-400">No projects</span>;
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm",
          "hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400",
          "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
          open && "ring-2 ring-slate-400",
        )}
      >
        <FolderOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <span>{activeProject?.name ?? activeProject?.key ?? "Select project…"}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform dark:text-slate-500",
            open && "rotate-180",
          )}
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 w-72 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          align="start"
          sideOffset={4}
          // Prevent the search input's keyboard events from closing the menu.
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              autoCorrect="off" autoCapitalize="off" spellCheck={false}
              ref={inputRef}
              type="text"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              // Prevent Radix from handling Space/Enter/Arrow on the input itself.
              onKeyDown={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Scrollable project list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">No projects match.</p>
            ) : (
              filtered.map((project) => (
                <DropdownMenu.Item
                  key={project.key}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none",
                    "hover:bg-slate-100 focus:bg-slate-100 dark:hover:bg-slate-700 dark:focus:bg-slate-700 dark:text-slate-200",
                    activeProject?.key === project.key &&
                      "bg-slate-50 font-medium dark:bg-slate-700",
                  )}
                  onSelect={() => setActiveProject(project)}
                >
                  <span className="flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                    {project.key}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-300 dark:text-slate-600">
                    {project.id}
                  </span>
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
