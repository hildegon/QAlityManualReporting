import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Loader2,
  Layers,
  Info,
  Pencil,
  Trash2,
  Save,
  X,
  PackageCheck,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useJiraProjects, useCreateVersion, useUpdateVersion } from "@/services/queries";
import { useVersionsStore } from "@/stores/versionsStore";
import type { VersionGroup } from "@/stores/versionsStore";
import { cn } from "@/components/ui/utils";
import { ConfirmModal } from "./ConfirmModal";
import type { JiraVersion } from "@/types";

// ── VersionRow ─────────────────────────────────────────────────────────────────

function VersionRow({
  version,
  onUpdate,
}: {
  version: JiraVersion;
  onUpdate: (patch: {
    name?: string;
    description?: string;
    released?: boolean;
    archived?: boolean;
    startDate?: string;
    releaseDate?: string;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(version.name);
  const [description, setDescription] = useState(version.description ?? "");
  const [startDate, setStartDate] = useState(version.start_date ?? "");
  const [releaseDate, setReleaseDate] = useState(version.release_date ?? "");
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  type PendingAction = {
    patch: Parameters<typeof onUpdate>[0];
    key: string;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
  };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    if (!editing) {
      setName(version.name);
      setDescription(version.description ?? "");
      setStartDate(version.start_date ?? "");
      setReleaseDate(version.release_date ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function saveEdit() {
    setSaving(true);
    onUpdate({
      name: name.trim() || version.name,
      description: description.trim(),
      ...(startDate ? { startDate } : {}),
      ...(releaseDate ? { releaseDate } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  function doAction(patch: Parameters<typeof onUpdate>[0], key: string) {
    setActioning(key);
    onUpdate(patch);
    setTimeout(() => setActioning(null), 1500);
  }

  function confirmAction(action: PendingAction) {
    setPendingAction(action);
  }

  function executeConfirmed() {
    if (!pendingAction) return;
    doAction(pendingAction.patch, pendingAction.key);
    setPendingAction(null);
  }

  const statusBadge = version.archived ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
      Archived
    </span>
  ) : version.released ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
      Released
    </span>
  ) : (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
      Unreleased
    </span>
  );

  const cellClass = "px-4 py-2.5 align-top";
  const inputClass = "w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  return (
    <>
    <ConfirmModal
      open={pendingAction !== null}
      title={pendingAction?.title ?? ""}
      message={pendingAction?.message ?? ""}
      confirmLabel={pendingAction?.confirmLabel ?? "Confirm"}
      danger={pendingAction?.danger ?? false}
      onConfirm={executeConfirmed}
      onCancel={() => setPendingAction(null)}
    />
    <tr className="bg-white transition-colors hover:bg-slate-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/40">
      <td className={cellClass}>{statusBadge}</td>

      <td className={cellClass}>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        ) : (
          <span className="font-medium text-slate-800 dark:text-slate-100">{version.name}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="—" className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.description || "—"}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.start_date ?? "—"}</span>
        )}
      </td>

      <td className={cellClass}>
        {editing ? (
          <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={inputClass} />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{version.release_date ?? "—"}</span>
        )}
      </td>

      <td className={cn(cellClass, "text-right")}>
        <div className="flex items-center justify-end gap-1">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                title="Save changes"
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(false); setName(version.name); setDescription(version.description ?? ""); setStartDate(version.start_date ?? ""); setReleaseDate(version.release_date ?? ""); }}
                title="Cancel"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                title="Edit"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              {!version.released && !version.archived && (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { released: true, releaseDate: releaseDate || new Date().toISOString().split("T")[0]! },
                      key: "release",
                      title: `Release "${version.name}"?`,
                      message: "This will mark the version as released in Jira. All linked issues will reflect the new release status.",
                      confirmLabel: "Release",
                    })
                  }
                  disabled={actioning === "release"}
                  title="Mark as Released"
                  className="rounded p-1 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30"
                >
                  {actioning === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                </button>
              )}

              {version.released && !version.archived && (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { released: false },
                      key: "unrelease",
                      title: `Unrelease "${version.name}"?`,
                      message: "This will revert the version back to unreleased in Jira.",
                      confirmLabel: "Unrelease",
                      danger: false,
                    })
                  }
                  disabled={actioning === "unrelease"}
                  title="Unrelease"
                  className="rounded p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/30"
                >
                  {actioning === "unrelease" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}

              {!version.archived ? (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { archived: true },
                      key: "archive",
                      title: `Archive "${version.name}"?`,
                      message: "Archived versions are hidden from most Jira views. You can unarchive it at any time.",
                      confirmLabel: "Archive",
                      danger: true,
                    })
                  }
                  disabled={actioning === "archive"}
                  title="Archive"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  {actioning === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <button
                  onClick={() =>
                    confirmAction({
                      patch: { archived: false },
                      key: "unarchive",
                      title: `Unarchive "${version.name}"?`,
                      message: "This will make the version visible again in Jira.",
                      confirmLabel: "Unarchive",
                    })
                  }
                  disabled={actioning === "unarchive"}
                  title="Unarchive"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  {actioning === "unarchive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    </>
  );
}

// ── ManageVersionsTab ──────────────────────────────────────────────────────────

interface ManageVersionsTabProps {
  projectKey: string;
  versions: JiraVersion[];
}

export function ManageVersionsTab({ projectKey, versions }: ManageVersionsTabProps) {
  const { data: projects } = useJiraProjects();
  const project = projects?.find((p) => p.key === projectKey);
  const { mutate: createVersion, isPending: creating } = useCreateVersion(projectKey);
  const { mutate: updateVersion } = useUpdateVersion(projectKey);
  const { versionGroups, addVersionGroup, updateVersionGroup, removeVersionGroup } =
    useVersionsStore();
  const groups = versionGroups[projectKey] ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newReleaseDate, setNewReleaseDate] = useState("");

  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);
  const pendingDeleteGroup = groups.find((g) => g.id === pendingDeleteGroupId) ?? null;
  const [groupName, setGroupName] = useState("");
  const [groupVersionIds, setGroupVersionIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupVersionIds, setEditGroupVersionIds] = useState<string[]>([]);

  function submitCreateGroup() {
    if (!groupName.trim() || groupVersionIds.length === 0) return;
    addVersionGroup(projectKey, {
      id: `group_${Date.now()}`,
      name: groupName.trim(),
      versionIds: groupVersionIds,
    });
    setShowGroupCreate(false);
    setGroupName("");
    setGroupVersionIds([]);
  }

  function startEditGroup(g: VersionGroup) {
    setEditingGroupId(g.id);
    setEditGroupName(g.name);
    setEditGroupVersionIds([...g.versionIds]);
  }

  function saveEditGroup() {
    if (!editingGroupId || !editGroupName.trim()) return;
    updateVersionGroup(projectKey, {
      id: editingGroupId,
      name: editGroupName.trim(),
      versionIds: editGroupVersionIds,
    });
    setEditingGroupId(null);
  }

  function toggleGroupVersion(versionId: string, checked: boolean) {
    setGroupVersionIds((prev) =>
      checked ? [...prev, versionId] : prev.filter((id) => id !== versionId),
    );
  }

  function toggleEditGroupVersion(versionId: string, checked: boolean) {
    setEditGroupVersionIds((prev) =>
      checked ? [...prev, versionId] : prev.filter((id) => id !== versionId),
    );
  }

  function submitCreate() {
    if (!newName.trim() || !project?.id) return;
    const trimmedDesc = newDescription.trim();
    createVersion(
      {
        projectId: project.id,
        name: newName.trim(),
        ...(trimmedDesc ? { description: trimmedDesc } : {}),
        ...(newStartDate ? { startDate: newStartDate } : {}),
        ...(newReleaseDate ? { releaseDate: newReleaseDate } : {}),
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setNewDescription("");
          setNewStartDate("");
          setNewReleaseDate("");
        },
      },
    );
  }

  const sorted = useMemo(() => {
    const order = (v: JiraVersion) => (v.archived ? 2 : v.released ? 1 : 0);
    return [...versions].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  }, [versions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {versions.length} version{versions.length !== 1 ? "s" : ""} in{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{projectKey}</span>
        </p>
        <button
          onClick={() => setShowCreate((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Plus className="h-3.5 w-3.5" />
          New Version
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/30">
          <p className="mb-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300">New Version</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                placeholder="e.g. 2.0.0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Description
              </label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Start Date
              </label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Release Date
              </label>
              <input
                type="date"
                value={newReleaseDate}
                onChange={(e) => setNewReleaseDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={submitCreate}
              disabled={!newName.trim() || !project?.id || creating}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Start Date</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Release Date</th>
              <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {sorted.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                onUpdate={(patch) => updateVersion({ versionId: v.id, ...patch })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Groups section ──────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Release Groups
            </span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              {groups.length}
            </span>
          </div>
          <button
            onClick={() => {
              setShowGroupCreate((o) => !o);
              setEditingGroupId(null);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New Group
          </button>
        </div>

        <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <p>
                <span className="font-semibold text-slate-800 dark:text-slate-100">Release Groups</span>{" "}
                let you combine multiple Jira versions into a single aggregated report. Test results,
                bugs, KPIs, and readiness checks are merged and deduplicated across all member versions.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-300">Example — </span>
                Your team ships in small increments:{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">2.1.0</span>
                ,{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">2.1.1</span>
                , and{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">2.1.2</span>{" "}
                are all part of the same sprint. Create a group called{" "}
                <span className="rounded bg-violet-100 px-1 font-mono text-[10px] text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">Sprint 12</span>{" "}
                and select all three — the Report tab will then show a unified view with all their
                executions, bugs, and pass rate combined.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Groups are local to QAlity and do not modify anything in Jira.
              </p>
            </div>
          </div>
        </div>

        {showGroupCreate && (
          <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20">
            <p className="mb-3 text-xs font-semibold text-violet-700 dark:text-violet-300">
              New Release Group
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Group Name <span className="text-red-500">*</span>
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCreateGroup()}
                placeholder="e.g. Q1 Release"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Versions <span className="text-red-500">*</span>
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                {versions.map((v) => (
                  <label
                    key={v.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={groupVersionIds.includes(v.id)}
                      onChange={(e) => toggleGroupVersion(v.id, e.target.checked)}
                      className="accent-violet-600"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-200">{v.name}</span>
                    {v.released && (
                      <span className="ml-auto text-[10px] text-emerald-500">Released</span>
                    )}
                    {v.archived && (
                      <span className="ml-auto text-[10px] text-slate-400">Archived</span>
                    )}
                  </label>
                ))}
              </div>
              {groupVersionIds.length > 0 && (
                <p className="mt-1 text-[10px] text-violet-600 dark:text-violet-400">
                  {groupVersionIds.length} version{groupVersionIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowGroupCreate(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateGroup}
                disabled={!groupName.trim() || groupVersionIds.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40 dark:bg-violet-500 dark:hover:bg-violet-600"
              >
                <Plus className="h-3 w-3" />
                Create Group
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 && !showGroupCreate ? (
          <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            No groups yet. Create one to combine multiple releases into a single report view.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) =>
              editingGroupId === g.id ? (
                <div
                  key={g.id}
                  className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20"
                >
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Group Name
                    </label>
                    <input
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Versions
                    </label>
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
                      {versions.map((v) => (
                        <label
                          key={v.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={editGroupVersionIds.includes(v.id)}
                            onChange={(e) => toggleEditGroupVersion(v.id, e.target.checked)}
                            className="accent-violet-600"
                          />
                          <span className="text-xs text-slate-700 dark:text-slate-200">{v.name}</span>
                          {v.released && (
                            <span className="ml-auto text-[10px] text-emerald-500">Released</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditGroup}
                      disabled={!editGroupName.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={g.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  <Layers className="h-4 w-4 shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {g.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {g.versionIds.map((id) => {
                        const v = versions.find((vv) => vv.id === id);
                        return v ? (
                          <span
                            key={id}
                            className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                          >
                            {v.name}
                          </span>
                        ) : null;
                      })}
                      {g.versionIds.length === 0 && (
                        <span className="text-[10px] text-slate-400">No versions</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => startEditGroup(g)}
                    title="Edit group"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPendingDeleteGroupId(g.id)}
                    title="Delete group"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingDeleteGroup !== null}
        title={`Delete group "${pendingDeleteGroup?.name ?? ""}"?`}
        message="This removes the group from QAlity. No versions or Jira data are affected."
        confirmLabel="Delete Group"
        danger
        onConfirm={() => {
          if (pendingDeleteGroupId) removeVersionGroup(projectKey, pendingDeleteGroupId);
          setPendingDeleteGroupId(null);
        }}
        onCancel={() => setPendingDeleteGroupId(null)}
      />
    </div>
  );
}
