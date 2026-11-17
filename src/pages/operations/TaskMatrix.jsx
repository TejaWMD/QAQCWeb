import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName } from "@/lib/permissions";
import { productionLines } from "@/lib/shiftLogConstants";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import AddRecordDialog from "@/components/factoryops/AddRecordDialog";
import StatusBadge from "@/components/factoryops/StatusBadge";
import TaskCellDialog from "@/components/factoryops/TaskCellDialog";

const STATUS_ORDER = ["Open", "In Progress", "Overdue", "Completed", "Verified"];

const addFields = [
  { key: "title", label: "Task", type: "text", required: true },
  { key: "module", label: "Module", type: "select", options: ["Task Matrix", "Production", "QA & HACCP", "Downtime", "Staffing"], default: "Task Matrix" },
  { key: "production_line", label: "Production Line", type: "select", options: productionLines },
  { key: "owner", label: "Supervisor (Owner)", type: "text" },
  { key: "shift_date", label: "Shift Date", type: "date", required: true },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], default: "Medium" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

const TEAMS = [
  "Packaging Supervisor",
  "Production Planner",
  "Production Supervisor",
  "QA/QC Team",
];

// Supervisor Task Matrix: Team Productivity KPIs + To-Do List of the Day, plus Matrix View.
export default function TaskMatrix() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [todoFilter, setTodoFilter] = useState("all");
  const [viewMode, setViewMode] = useState("todo");
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    return STATUS_ORDER.includes(fromUrl) ? fromUrl : "all";
  });

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await base44.entities.Task.list("-created_date", 200);
      setTasks(data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const unsubscribe = base44.entities.Task.subscribe(() => load(true));
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  const visibleTasks = statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);

  const { owners, titles, matrix } = useMemo(() => {
    const ownersList = [];
    const titlesList = [];
    const map = new Map();
    visibleTasks.forEach((t) => {
      const owner = t.owner || "Unassigned";
      if (!ownersList.includes(owner)) ownersList.push(owner);
      if (!titlesList.includes(t.title)) titlesList.push(t.title);
      const key = `${owner}||${t.title}`;
      const prev = map.get(key);
      const rank = (s) => (STATUS_ORDER.includes(s) ? STATUS_ORDER.indexOf(s) : 9);
      if (!prev || rank(t.status) < rank(prev.status)) map.set(key, t);
    });
    return { owners: ownersList, titles: titlesList, matrix: map };
  }, [visibleTasks]);

  const handleAdd = async (values) => {
    const created = await base44.entities.Task.create(values);
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: eventStamp(),
        user_name: actingUserName(user),
        module: "Supervisor Task Matrix",
        action: "Created",
        record_id: created?.id || "",
        details: `Task "${values.title}" created`,
        old_value: "",
        new_value: "Open",
      });
    } catch {
      // An audit write must never block the operation itself.
    }
    await load(true);
  };

  const toggleDone = async (task) => {
    const isDone = task.status === "Completed" || task.status === "Verified";
    const nextStatus = isDone ? "Open" : "Completed";
    await base44.entities.Task.update(task.id, { status: nextStatus });
    await load(true);
  };

  const teamStats = useMemo(() => {
    return TEAMS.map((team) => {
      const teamTasks = tasks.filter((t) => {
        const owner = (t.owner || "").toLowerCase();
        const mod = (t.module || "").toLowerCase();
        const key = team.toLowerCase().split(" ")[0];
        return owner.includes(key) || mod.includes(key) || (team === "QA/QC Team" && (owner.includes("qa") || mod.includes("qa")));
      });
      const done = teamTasks.filter((t) => t.status === "Completed" || t.status === "Verified").length;
      const total = teamTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { team, total, done, pct };
    });
  }, [tasks]);

  const todoTasks = useMemo(() => {
    return visibleTasks.filter((t) => {
      if (selectedTeam !== "all") {
        const key = selectedTeam.toLowerCase().split(" ")[0];
        const owner = (t.owner || "").toLowerCase();
        const mod = (t.module || "").toLowerCase();
        const match = owner.includes(key) || mod.includes(key) || (selectedTeam === "QA/QC Team" && (owner.includes("qa") || mod.includes("qa")));
        if (!match) return false;
      }
      if (todoFilter === "pending") {
        return t.status !== "Completed" && t.status !== "Verified";
      }
      return true;
    });
  }, [visibleTasks, selectedTeam, todoFilter]);

  return (
    <div className="min-h-screen bg-[#0a0e17] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-white text-lg font-semibold">Supervisor Task Matrix</h2>
          <p className="text-[#a0aec0] text-sm mt-1">Daily to-do productivity KPIs per role and supervisor task matrix.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#1e2740] bg-[#0e131d] p-0.5">
            {[["todo", "To-Do List"], ["matrix", "Matrix View"]].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setViewMode(k)}
                className={`px-3 py-1 text-xs rounded-md ${viewMode === k ? "bg-[#00e5ff] text-[#0a0e17] font-semibold" : "text-[#a0aec0] hover:text-white"}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] bg-[#0e131d] border-[#1e2740] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setAddOpen(true)} className="bg-[#00e5ff] hover:bg-[#00c3d7] text-[#0a0e17] font-semibold">
            <Plus className="w-4 h-4 mr-1" /> Add to-do
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {teamStats.map((s) => {
          const active = selectedTeam === s.team;
          return (
            <button
              key={s.team}
              type="button"
              onClick={() => setSelectedTeam(active ? "all" : s.team)}
              className={`text-left rounded-xl border p-3 transition-colors ${active ? "border-[#00e5ff] bg-[#00e5ff]/5" : "border-[#1e2740] bg-[#0e131d] hover:border-[#2c3a5e]"}`}
            >
              <p className="text-xs text-[#a0aec0] font-medium">{s.team}</p>
              <p className="text-2xl font-bold text-[#00ff9d] mt-1">{s.pct}%</p>
              <p className="text-[11px] text-[#5f6b7f] mt-0.5">{s.done} of {s.total} done</p>
              <div className="w-full h-1.5 rounded-full bg-[#1e2740] mt-2 overflow-hidden">
                <div className="h-full bg-[#00ff9d]" style={{ width: `${s.pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {viewMode === "todo" ? (
        <div className="bg-[#131926] rounded-xl border border-[#1e2740] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2740] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#00e5ff]" />
              <span className="text-sm font-semibold text-white">
                {selectedTeam === "all" ? "All Teams" : selectedTeam} · Today&apos;s To-Do List
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[["all", "All"], ["pending", "Pending"]].map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTodoFilter(k)}
                  className={`px-2.5 py-1 text-xs rounded-md ${todoFilter === k ? "bg-[#00e5ff]/15 text-[#00e5ff] font-semibold" : "text-[#a0aec0] hover:text-white"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-[#1e2740] hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead className="text-[#a0aec0]">Task</TableHead>
                <TableHead className="text-[#a0aec0]">Owner</TableHead>
                <TableHead className="text-[#a0aec0]">Source</TableHead>
                <TableHead className="text-[#a0aec0]">Due</TableHead>
                <TableHead className="text-[#a0aec0]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todoTasks.length === 0 ? (
                <TableRow className="border-[#1e2740]">
                  <TableCell colSpan={6} className="text-center text-[#a0aec0] py-8">
                    No tasks found. Click &quot;Add to-do&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                todoTasks.map((t) => {
                  const done = t.status === "Completed" || t.status === "Verified";
                  return (
                    <TableRow key={t.id} className="border-[#1e2740] hover:bg-white/[0.02]">
                      <TableCell>
                        <Checkbox checked={done} onCheckedChange={() => toggleDone(t)} />
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => setSelected(t)} className="text-left">
                          <p className={`text-sm font-medium ${done ? "line-through text-[#5f6b7f]" : "text-white"}`}>{t.title}</p>
                          {t.production_line && <p className="text-[11px] text-[#5f6b7f]">{t.production_line}</p>}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-[#a0aec0]">{t.owner || "—"}</TableCell>
                      <TableCell className="text-xs text-[#a0aec0]">{t.module || "Routine"}</TableCell>
                      <TableCell className="text-xs text-[#a0aec0]">{t.due_date || t.shift_date || "Today"}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-[#a0aec0]">Legend:</span>
        {STATUS_ORDER.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>

      <div className="bg-[#131926] rounded-xl border border-[#1e2740] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#1e2740] hover:bg-transparent">
              <TableHead className="text-[#a0aec0] min-w-[160px] sticky left-0 bg-[#131926]">Supervisor</TableHead>
              {titles.map((t) => (
                <TableHead key={t} className="text-[#a0aec0] min-w-[140px]">{t}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className="border-[#1e2740]">
                <TableCell colSpan={titles.length + 1} className="text-center py-8">
                  <span className="inline-block w-5 h-5 border-2 border-[#1e2740] border-t-[#00e5ff] rounded-full animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!loading && tasks.length === 0 && (
              <TableRow className="border-[#1e2740]">
                <TableCell colSpan={titles.length + 1} className="text-center text-[#a0aec0] py-8">
                  {statusFilter === "all" ? "No tasks yet. Use Add Task to create the first one." : "No tasks match this status filter."}
                </TableCell>
              </TableRow>
            )}
            {!loading && owners.map((owner) => (
              <TableRow key={owner} className="border-[#1e2740]">
                <TableCell className="text-sm text-white font-medium sticky left-0 bg-[#131926]">{owner}</TableCell>
                {titles.map((t) => {
                  const task = matrix.get(`${owner}||${t}`);
                  return (
                    <TableCell key={t} className="p-1.5">
                      {task ? (
                        <button type="button" onClick={() => setSelected(task)} className="w-full text-left">
                          <StatusBadge status={task.status} />
                        </button>
                      ) : (
                        <span className="text-[#a0aec0]">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </>
      )}

      <AddRecordDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Task"
        fields={addFields}
        onSubmit={handleAdd}
      />
      <TaskCellDialog
        task={selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onUpdated={() => load(true)}
      />
    </div>
  );
}