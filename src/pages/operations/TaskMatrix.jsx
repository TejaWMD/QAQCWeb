import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { listAllUsers } from "@/services/authService";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, appRoleOf } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Pencil, Plus, Trash2, User } from "lucide-react";
import TaskCellDialog from "@/components/factoryops/TaskCellDialog";

const TEAMS = [
  "QA/QC Team",
  "Packaging Supervisor",
  "Production Planner",
  "Production Supervisor",
];

const SOURCES = ["Routine", "From production"];

const TASK_CATEGORIES = [
  "Pending",
  "In Progress",
  "Completed",
  "Awaiting Approval",
  "To Be Discussed",
];

const CATEGORY_META = {
  Pending: {
    pill: "bg-slate-700/40 text-slate-200 border border-slate-600/50",
    countText: "text-slate-200",
    activeRing: "border-slate-400/70 bg-slate-800/60",
  },
  "In Progress": {
    pill: "bg-sky-500/15 text-sky-300 border border-sky-500/35",
    countText: "text-sky-300",
    activeRing: "border-sky-400/70 bg-sky-500/10",
  },
  Completed: {
    pill: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35",
    countText: "text-emerald-300",
    activeRing: "border-emerald-400/70 bg-emerald-500/10",
  },
  "Awaiting Approval": {
    pill: "bg-violet-500/15 text-violet-300 border border-violet-500/35",
    countText: "text-violet-300",
    activeRing: "border-violet-400/70 bg-violet-500/10",
  },
  "To Be Discussed": {
    pill: "bg-amber-500/15 text-amber-300 border border-amber-500/35",
    countText: "text-amber-300",
    activeRing: "border-amber-400/70 bg-amber-500/10",
  },
};

const SOURCE_PILL = {
  Routine: "bg-slate-700/40 text-slate-300 border border-slate-600/40",
  "From production": "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
};

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

function normalizeCategory(rawStatus) {
  const s = String(rawStatus || "").trim();
  if (TASK_CATEGORIES.includes(s)) return s;
  const low = s.toLowerCase();
  if (low === "completed" || low === "verified" || low === "done") return "Completed";
  if (low === "in progress" || low === "due soon") return "In Progress";
  if (low === "awaiting approval") return "Awaiting Approval";
  if (low === "to be discussed") return "To Be Discussed";
  return "Pending";
}

function isCompiledViewer(user) {
  if (!user) return false;
  const role = appRoleOf(user);
  if (role === "manager" || role === "admin") return true;
  const hay = `${user.name || ""} ${user.full_name || ""} ${user.email || ""} ${user.role_label || ""} ${user.dept || ""}`.toLowerCase();
  return /\bdev\b/.test(hay) || /\b(md|managing director|director)\b/.test(hay);
}

function isQaqcMember(u) {
  if (!u || u.status === "suspended") return false;
  if (u.app_role === "qa_officer") return true;
  const hay = `${u.role_label || ""} ${u.dept || ""}`.toLowerCase();
  return /\b(qa|qc|qaqc|quality|haccp)\b|qa\s*\/?\s*qc/.test(hay);
}

function taskBelongsToUser(task, user) {
  if (!task || !user) return false;
  const myName = String(user.full_name || user.name || "").trim().toLowerCase();
  const myEmail = String(user.email || "").trim().toLowerCase();
  const myId = String(user.id || "").trim().toLowerCase();
  const owner = String(task.owner || "").trim().toLowerCase();
  const createdBy = String(task.created_by || "").trim().toLowerCase();

  if (myName && (owner === myName || createdBy === myName)) return true;
  if (myEmail && (owner === myEmail || createdBy === myEmail)) return true;
  if (myId && createdBy === myId) return true;

  // Non-QAQC supervisors see their team tasks
  const role = appRoleOf(user);
  if (role === "supervisor" && owner.includes("supervisor")) return true;
  return false;
}

export default function TaskMatrix() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const canCompileAll = isCompiledViewer(user);
  const myDisplayName = user?.full_name || user?.name || user?.email || "QA/QC Team";

  const [tasks, setTasks] = useState([]);
  const [qaqcMembers, setQaqcMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => (canCompileAll ? "compiled" : "mine"));
  const [memberFilter, setMemberFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState(() => {
    const st = String(searchParams.get("status") || "").toLowerCase();
    if (st === "overdue" || st === "pending") return "Pending";
    return "all";
  });
  const [selectedTask, setSelectedTask] = useState(null);

  // Add / Edit To-Do Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    notes: "",
    owner: myDisplayName,
    module: "Routine",
    production_line: "",
    shift_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    priority: "Medium",
    status: "Pending",
  });

  useEffect(() => {
    setViewMode(canCompileAll ? "compiled" : "mine");
  }, [canCompileAll]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await base44.entities.Task.list("-created_date", 300);
      setTasks(Array.isArray(data) ? data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listAllUsers()
      .then((users) => {
        const qa = (users || []).filter(isQaqcMember);
        setQaqcMembers(qa);
      })
      .catch(() => setQaqcMembers([]));
  }, []);

  useEffect(() => {
    const unsubscribe = base44.entities.Task.subscribe(() => load(true));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const todayHeader = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, []);

  // All selectable owners for dropdowns & Sir Dev's compiled member filter
  const ownerOptions = useMemo(() => {
    const set = new Set();
    if (myDisplayName) set.add(myDisplayName);
    qaqcMembers.forEach((m) => {
      if (m.name) set.add(m.name);
    });
    tasks.forEach((t) => {
      if (t.owner) set.add(String(t.owner).trim());
    });
    TEAMS.forEach((team) => set.add(team));
    return [...set].filter(Boolean);
  }, [qaqcMembers, tasks, myDisplayName]);

  // Base task pool according to view mode:
  // - Compiled View (Sir Dev / MD / Admin): ALL tasks compiled together (optionally filtered by member/team)
  // - Individual QAQC member view: that member's own tasks (or tasks assigned to them)
  const scopedTasks = useMemo(() => {
    if (viewMode === "compiled" && canCompileAll) {
      if (memberFilter === "all") return tasks;
      return tasks.filter(
        (t) =>
          String(t.owner || "").trim().toLowerCase() === memberFilter.toLowerCase() ||
          String(t.created_by || "").trim().toLowerCase() === memberFilter.toLowerCase()
      );
    }
    return tasks.filter((t) => taskBelongsToUser(t, user));
  }, [tasks, viewMode, canCompileAll, memberFilter, user]);

  // Category counts (no percentages)
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(TASK_CATEGORIES.map((c) => [c, 0]));
    scopedTasks.forEach((t) => {
      const cat = normalizeCategory(t.status);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [scopedTasks]);

  const visibleTasks = useMemo(() => {
    if (categoryFilter === "all") return scopedTasks;
    return scopedTasks.filter((t) => normalizeCategory(t.status) === categoryFilter);
  }, [scopedTasks, categoryFilter]);

  const updateCategory = async (task, nextCategory) => {
    try {
      const oldStatus = normalizeCategory(task.status);
      await base44.entities.Task.update(task.id, { status: nextCategory });
      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Supervisor Task Matrix",
          action: "Updated",
          record_id: task.id,
          details: `Task "${task.title}" categorized as ${nextCategory}`,
          old_value: oldStatus,
          new_value: nextCategory,
        });
      } catch {
        // Non-blocking audit log
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextCategory } : t)));
      toast.success(`Task categorized as "${nextCategory}".`);
    } catch (err) {
      toast.error(err?.message || "Failed to update task status.");
    }
  };

  const toggleDone = async (task) => {
    const current = normalizeCategory(task.status);
    const nextCategory = current === "Completed" ? "Pending" : "Completed";
    await updateCategory(task, nextCategory);
  };

  const openAddModal = () => {
    setEditingId(null);
    const defaultOwner =
      viewMode === "compiled" && memberFilter !== "all" ? memberFilter : myDisplayName;
    setForm({
      title: "",
      notes: "",
      owner: defaultOwner,
      module: "Routine",
      production_line: "",
      shift_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      priority: "Medium",
      status: "Pending",
    });
    setModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingId(t.id);
    setForm({
      title: t.title || "",
      notes: t.notes || "",
      owner: t.owner || myDisplayName,
      module: SOURCES.includes(t.module) ? t.module : "Routine",
      production_line: t.production_line || "Today",
      shift_date: String(t.shift_date || new Date().toISOString()).slice(0, 10),
      due_date: t.due_date ? String(t.due_date).slice(0, 10) : "",
      priority: t.priority || "Medium",
      status: normalizeCategory(t.status),
    });
    setModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) {
      toast.error("Task title is required.");
      return;
    }
    try {
      const assignedOwner = canCompileAll ? (form.owner || myDisplayName) : myDisplayName;
      const payload = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        owner: assignedOwner,
        module: form.module,
        production_line: form.production_line.trim() || "Today",
        shift_date: form.shift_date || new Date().toISOString().slice(0, 10),
        due_date: form.due_date || null,
        priority: form.priority || "Medium",
        status: normalizeCategory(form.status),
        ...(!editingId ? { created_by: user?.email || user?.name || myDisplayName } : {}),
      };
      if (editingId) {
        await base44.entities.Task.update(editingId, payload);
        toast.success("To-do updated.");
      } else {
        const created = await base44.entities.Task.create(payload);
        try {
          await base44.entities.AuditLog.create({
            event_time: new Date().toISOString(),
            event_stamp: eventStamp(),
            user_name: actingUserName(user),
            module: "Supervisor Task Matrix",
            action: "Created",
            record_id: created?.id || "",
            details: `Task "${payload.title}" created for ${payload.owner} (${payload.status})`,
            old_value: "",
            new_value: payload.status,
          });
        } catch {
          // Non-blocking audit log
        }
        toast.success("To-do added.");
      }
      setModalOpen(false);
      setEditingId(null);
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Could not save task.");
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Delete to-do "${task.title}"?`)) return;
    try {
      await base44.entities.Task.delete(task.id);
      toast.success("To-do deleted.");
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Could not delete task.");
    }
  };

  const isCompiledActive = viewMode === "compiled" && canCompileAll;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Supervisor Task Matrix</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isCompiledActive
              ? "Compiled view — all QA/QC team & supervisor tasks together"
              : `${myDisplayName} — categorize your tasks by status`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCompileAll && (
            <div className="flex items-center rounded-lg bg-[#111827] border border-[#1e293b] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("compiled")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  viewMode === "compiled"
                    ? "bg-cyan-500/20 text-cyan-300 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Compiled View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("mine")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                  viewMode === "mine"
                    ? "bg-cyan-500/20 text-cyan-300 font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-3.5 h-3.5" /> My Tasks
              </button>
            </div>
          )}
          <span className="text-xs text-slate-400">{todayHeader}</span>
        </div>
      </div>

      {/* 5 Category Summary Cards (NO percentages) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TASK_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const active = categoryFilter === cat;
          const count = categoryCounts[cat] || 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(active ? "all" : cat)}
              className={`text-left rounded-xl border p-4 transition-all ${
                active
                  ? `${meta.activeRing} shadow-sm`
                  : "border-[#1e293b] bg-[#111827] hover:border-slate-700"
              }`}
            >
              <p className="text-xs text-slate-300 font-medium">{cat}</p>
              <p className={`text-2xl font-semibold mt-1 ${meta.countText}`}>{count}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {count === 1 ? "task" : "tasks"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Task List Panel */}
      <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">
              {isCompiledActive
                ? memberFilter === "all"
                  ? `All Compiled Tasks (${scopedTasks.length})`
                  : `${memberFilter} (${scopedTasks.length})`
                : `${myDisplayName} · tasks (${scopedTasks.length})`}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCompiledActive && (
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="h-8 w-[190px] bg-[#0b1120] border-[#293548] text-slate-200 text-xs">
                  <SelectValue placeholder="All members (compiled)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members (Compiled)</SelectItem>
                  {ownerOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-[165px] bg-[#0b1120] border-[#293548] text-slate-200 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {TASK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={openAddModal}
              className="h-8 px-3 text-xs rounded-lg bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 hover:bg-cyan-500/30"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add to-do
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0b1120]/60 text-slate-400 border-b border-[#1e293b]">
              <tr>
                <th className="w-10 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 font-medium">Task</th>
                {isCompiledActive && (
                  <th className="text-left px-4 py-2.5 font-medium">Member / Owner</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium">Source</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-left px-4 py-2.5 font-medium">Category / Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              {loading && (
                <tr>
                  <td colSpan={isCompiledActive ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                    Loading tasks...
                  </td>
                </tr>
              )}
              {!loading && visibleTasks.length === 0 && (
                <tr>
                  <td colSpan={isCompiledActive ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                    No tasks found. Click &ldquo;Add to-do&rdquo; to create one.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleTasks.map((t) => {
                  const category = normalizeCategory(t.status);
                  const done = category === "Completed";
                  const sourceLabel = t.module === "From production" ? "From production" : "Routine";
                  const dueLabel = t.production_line || (t.due_date ? String(t.due_date).slice(0, 10) : "Today");
                  const meta = CATEGORY_META[category] || CATEGORY_META.Pending;
                  return (
                    <tr key={t.id} className="hover:bg-[#1e293b]/30">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggleDone(t)}
                          className="border-slate-600 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedTask(t)} className="text-left">
                          <p className={`text-xs font-medium ${done ? "text-slate-400 line-through" : "text-slate-100"}`}>
                            {t.title}
                          </p>
                          {t.notes && <p className="text-[11px] text-slate-400 mt-0.5">{t.notes}</p>}
                        </button>
                      </td>
                      {isCompiledActive && (
                        <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">
                          {t.owner || t.created_by || "Unassigned"}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${SOURCE_PILL[sourceLabel]}`}>
                          {sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{dueLabel}</td>
                      <td className="px-4 py-3">
                        <Select value={category} onValueChange={(v) => updateCategory(t, v)}>
                          <SelectTrigger className={`h-7 w-[155px] text-[11px] font-medium px-2.5 ${meta.pill}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1e293b] mr-1"
                          title="Edit task"
                        >
                          <Pencil className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(t)}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1e293b]"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit To-Do Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingId ? "Edit to-do" : "Add to-do"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Task *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. CCP checks, morning"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Subtitle / Details</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Every day or Batch DSJ-291026"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Member / Owner</label>
                {canCompileAll ? (
                  <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
                    <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={myDisplayName}
                    readOnly
                    className="bg-[#0b1120] border-[#293548] text-slate-300 cursor-default"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Source</label>
                <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((src) => (
                      <SelectItem key={src} value={src}>{src}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Due (Time / Label)</label>
                <Input
                  value={form.production_line}
                  onChange={(e) => setForm({ ...form, production_line: e.target.value })}
                  placeholder="e.g. 8:00, 11:00, Today"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Category / Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-[#293548] bg-transparent text-slate-300 hover:bg-[#1e293b] hover:text-white">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveTask}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 font-semibold"
            >
              {editingId ? "Save changes" : "Add to-do"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskCellDialog
        task={selectedTask}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        onUpdated={() => load(true)}
      />
    </div>
  );
}
