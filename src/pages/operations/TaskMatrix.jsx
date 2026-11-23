import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, appRoleOf } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import TaskCellDialog from "@/components/factoryops/TaskCellDialog";

const TEAMS = [
  "Packaging Supervisor",
  "Production Planner",
  "Production Supervisor",
  "QA/QC Team",
];

const SOURCES = ["Routine", "From production"];
const TASK_STATUSES = ["Open", "In Progress", "Overdue", "Completed", "Verified"];

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

const defaultTeamForRole = (role) => {
  if (role === "qa_officer") return "QA/QC Team";
  if (role === "supervisor") return "Packaging Supervisor";
  return "QA/QC Team";
};

function matchesTeam(task, team) {
  const owner = String(task.owner || "").trim().toLowerCase();
  const mod = String(task.module || "").trim().toLowerCase();
  if (owner === team.toLowerCase()) return true;
  if (team === "Packaging Supervisor") return owner.includes("packaging") || mod.includes("packaging");
  if (team === "Production Planner") return owner.includes("planner") || mod.includes("planning") || mod.includes("planner");
  if (team === "Production Supervisor") return (owner.includes("production") && !owner.includes("planner")) || mod === "production";
  if (team === "QA/QC Team") return owner.includes("qa") || owner.includes("qc") || mod.includes("qa") || mod.includes("haccp");
  return false;
}

function displayStatusOf(task) {
  const s = String(task.status || "Open");
  if (s === "Completed" || s === "Verified" || s === "Done") return "Done";
  if (s === "Overdue") return "Overdue";
  if (s === "In Progress" || s === "Due soon") return "Due soon";
  return "Pending";
}

const STATUS_PILL = {
  Done: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  "Due soon": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  Pending: "bg-slate-700/40 text-slate-300 border border-slate-600/40",
};

const SOURCE_PILL = {
  Routine: "bg-slate-700/40 text-slate-300 border border-slate-600/40",
  "From production": "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
};

export default function TaskMatrix() {
  const { user } = useAuth();
  const role = appRoleOf(user);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(() => defaultTeamForRole(role));
  const [todoFilter, setTodoFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);

  // Add / Edit To-Do Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    notes: "Every day",
    owner: "QA/QC Team",
    module: "Routine",
    production_line: "Today",
    shift_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    priority: "Medium",
    status: "Open",
  });

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
  }, []);

  useEffect(() => {
    const unsubscribe = base44.entities.Task.subscribe(() => load(true));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const todayHeader = useMemo(() => {
    const now = new Date();
    const formatted = now.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${formatted} · Shift A`;
  }, []);

  const teamStats = useMemo(() => {
    return TEAMS.map((team) => {
      const teamTasks = tasks.filter((t) => matchesTeam(t, team));
      const done = teamTasks.filter((t) => displayStatusOf(t) === "Done").length;
      const total = teamTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const overdue = teamTasks.filter((t) => displayStatusOf(t) === "Overdue").length;
      const onTimePct = total > 0 ? Math.max(0, Math.round(((total - overdue) / total) * 100)) : 100;
      const productivityScore = Math.round(pct * 0.7 + onTimePct * 0.3);
      return { team, total, done, pct, onTimePct, productivityScore };
    });
  }, [tasks]);

  const activeTeamStat = teamStats.find((s) => s.team === selectedTeam) || teamStats[0];

  const todoTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedTeam && !matchesTeam(t, selectedTeam)) return false;
      if (todoFilter === "pending") {
        return displayStatusOf(t) !== "Done";
      }
      return true;
    });
  }, [tasks, selectedTeam, todoFilter]);

  const toggleDone = async (task) => {
    try {
      const isDone = displayStatusOf(task) === "Done";
      const nextStatus = isDone ? "Open" : "Completed";
      await base44.entities.Task.update(task.id, { status: nextStatus });
      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Supervisor Task Matrix",
          action: "Updated",
          record_id: task.id,
          details: `Task "${task.title}" marked ${nextStatus}`,
          old_value: task.status || "Open",
          new_value: nextStatus,
        });
      } catch {
        // Non-blocking audit log
      }
      toast.success(`Task marked as ${nextStatus === "Completed" ? "Done" : "Pending"}.`);
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Failed to update task.");
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm({
      title: "",
      notes: "Every day",
      owner: selectedTeam || "QA/QC Team",
      module: "Routine",
      production_line: "Today",
      shift_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      priority: "Medium",
      status: "Open",
    });
    setModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingId(t.id);
    setForm({
      title: t.title || "",
      notes: t.notes || "",
      owner: TEAMS.find((team) => matchesTeam(t, team)) || t.owner || selectedTeam || "QA/QC Team",
      module: SOURCES.includes(t.module) ? t.module : "Routine",
      production_line: t.production_line || "Today",
      shift_date: String(t.shift_date || new Date().toISOString()).slice(0, 10),
      due_date: t.due_date ? String(t.due_date).slice(0, 10) : "",
      priority: t.priority || "Medium",
      status: TASK_STATUSES.includes(t.status) ? t.status : "Open",
    });
    setModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) {
      toast.error("Task title is required.");
      return;
    }
    try {
      const payload = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        owner: form.owner,
        module: form.module,
        production_line: form.production_line.trim() || "Today",
        shift_date: form.shift_date || new Date().toISOString().slice(0, 10),
        due_date: form.due_date || null,
        priority: form.priority || "Medium",
        status: form.status || "Open",
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
            details: `Task "${payload.title}" created for ${payload.owner}`,
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

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Supervisor Task Matrix</h2>
        <span className="text-xs text-slate-400">{todayHeader}</span>
      </div>

      {/* 4 Role Productivity Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {teamStats.map((s) => {
          const active = selectedTeam === s.team;
          const isGood = s.pct >= 70;
          return (
            <button
              key={s.team}
              type="button"
              onClick={() => setSelectedTeam(s.team)}
              className={`text-left rounded-xl border p-4 transition-all ${
                active
                  ? "border-cyan-400/70 bg-[#102235] shadow-sm"
                  : "border-[#1e293b] bg-[#111827] hover:border-slate-700"
              }`}
            >
              <p className="text-xs text-slate-300 font-medium">{s.team}</p>
              <p className={`text-2xl font-semibold mt-1 ${isGood ? "text-emerald-400" : "text-amber-400"}`}>
                {s.pct}%
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {s.done} of {s.total} done
              </p>
              <div className="w-full h-1.5 rounded-full bg-[#1e293b] mt-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${isGood ? "bg-emerald-500" : "bg-amber-400"}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Today's To-Do List Panel */}
      <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            {selectedTeam} · today&apos;s to-do list
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400">
              On time {activeTeamStat?.onTimePct ?? 100}% · Productivity score {activeTeamStat?.productivityScore ?? 0}
            </span>
            <div className="flex items-center gap-1.5">
              {[["all", "All"], ["pending", "Pending"]].map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTodoFilter(k)}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    todoFilter === k
                      ? "bg-[#1e293b] border-slate-600 text-white font-medium"
                      : "bg-[#0b1120] border-[#1e293b] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lbl}
                </button>
              ))}
              <Button
                size="sm"
                onClick={openAddModal}
                className="h-7 px-3 text-xs rounded-lg bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 hover:bg-cyan-500/30"
              >
                Add to-do
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0b1120]/60 text-slate-400 border-b border-[#1e293b]">
              <tr>
                <th className="w-10 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 font-medium">Task</th>
                <th className="text-left px-4 py-2.5 font-medium">Source</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading tasks...
                  </td>
                </tr>
              )}
              {!loading && todoTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No tasks found for {selectedTeam}. Click &ldquo;Add to-do&rdquo; to create one.
                  </td>
                </tr>
              )}
              {!loading &&
                todoTasks.map((t) => {
                  const dispStatus = displayStatusOf(t);
                  const done = dispStatus === "Done";
                  const sourceLabel = t.module === "From production" ? "From production" : "Routine";
                  const dueLabel = t.production_line || (t.due_date ? String(t.due_date).slice(0, 10) : "Today");
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
                          <p className="text-xs font-medium text-slate-100">{t.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{t.notes || "Every day"}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${SOURCE_PILL[sourceLabel]}`}>
                          {sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{dueLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[dispStatus]}`}>
                          {dispStatus}
                        </span>
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

        <div className="px-4 py-3 border-t border-[#1e293b] text-xs text-slate-400">
          Ticking a task, or submitting its form, updates the team&apos;s percentage here and on the Attention Dashboard.
        </div>
      </div>

      {/* Add / Edit To-Do Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{editingId ? "Edit to-do" : "Add to-do"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Task *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. CCP checks, morning"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Subtitle / Details</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Every day or Batch DSJ-291026"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Role / Team</label>
                <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAMS.map((team) => (
                      <SelectItem key={team} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Due (Time / Label)</label>
                <Input
                  value={form.production_line}
                  onChange={(e) => setForm({ ...form, production_line: e.target.value })}
                  placeholder="e.g. 8:00, 11:00, Today"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Pending</SelectItem>
                    <SelectItem value="In Progress">Due soon</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Completed">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              onClick={handleSaveTask}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
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
