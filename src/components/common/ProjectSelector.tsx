import { useJiraProjects } from "@/services/queries";
import { useProjectStore } from "@/stores/projectStore";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, FolderOpen } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { cn } from "@/components/ui/utils";

export function ProjectSelector() {
  const { data: projects, isLoading, isError } = useJiraProjects();
  const { activeProject, setActiveProject } = useProjectStore();

  if (isLoading) return <Spinner size="sm" />;
  if (isError || !projects?.length) {
    return <span className="text-sm text-slate-400">No projects</span>;
  }

  return (
    <Select.Root
      value={activeProject?.key ?? ""}
      onValueChange={(key) => {
        const project = projects.find((p) => p.key === key);
        setActiveProject(project ?? null);
      }}
    >
      <Select.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm",
          "hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400",
        )}
      >
        <FolderOpen className="h-4 w-4 text-slate-500" />
        <Select.Value placeholder="Select project…" />
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-50 min-w-[220px] rounded-md border border-slate-200 bg-white shadow-lg"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            {projects.map((project) => (
              <Select.Item
                key={project.key}
                value={project.key}
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none hover:bg-slate-100 data-[highlighted]:bg-slate-100"
              >
                <Select.ItemText>
                  <span className="font-mono text-xs text-slate-500">{project.key}</span>
                  <span className="ml-2">{project.name}</span>
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
