import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, canChangeRecord } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import AddRecordDialog from "@/components/factoryops/AddRecordDialog";
import StatusBadge from "@/components/factoryops/StatusBadge";
import { logSystemAction } from "@/lib/historyLog";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

// Generic dark-themed records table for the FactoryOps modules: lists one entity,
// supports adding records, inline status changes and deletion, and writes an
// AuditLog entry for every action.
export default function RecordsTable({
  entity,
  title,
  subtitle,
  columns,
  fields = [],
  statuses,
  guard,
  markOverdue,
  onAfterCreate,
  onAfterChange,
  addLabel,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    return statuses && statuses.includes(fromUrl) ? fromUrl : "all";
  });

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await base44.entities[entity].list("-created_date", 200);
      setRecords(data);
      if (markOverdue) {
        const today = new Date().toISOString().slice(0, 10);
        const ids = data
          .filter((r) => markOverdue(r, today) && !["Overdue", "Completed", "Verified"].includes(r.status))
          .map((r) => r.id);
        if (ids.length > 0) {
          await base44.entities[entity].updateMany({ id: { $in: ids } }, { $set: { status: "Overdue" } });
          // The app flagged these records itself, so the change is a system action.
          await logSystemAction({
            module: title,
            action: "Updated",
            entity,
            recordId: ids.join(", "),
            details: `System flagged ${ids.length} ${ids.length === 1 ? "record" : "records"} Overdue — the due date has passed`,
            oldValue: "Open",
            newValue: "Overdue",
            changes: [`Status: Open → Overdue (${ids.length} ${ids.length === 1 ? "record" : "records"})`],
          });
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entity]);

  useEffect(() => {
    const unsubscribe = base44.entities[entity].subscribe(() => load(true));
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [entity]);

  const audit = async (action, recordId, details, oldValue = "", newValue = "") => {
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: eventStamp(),
        user_name: actingUserName(user),
        module: title,
        action,
        record_id: recordId || "",
        details,
        old_value: oldValue,
        new_value: newValue,
      });
    } catch {
      // An audit write must never block the operation itself.
    }
  };

  const handleAdd = async (values) => {
    const created = await base44.entities[entity].create(values);
    await audit("Created", created?.id, `New record created in ${title}`);
    await onAfterCreate?.(created);
  };

  const changeStatus = async (record, status) => {
    if (guard) {
      const error = guard(record, status);
      if (error) {
        toast.error(error);
        return;
      }
    }
    try {
      const prev = record.status || "";
      await base44.entities[entity].update(record.id, { status });
      await audit("Updated", record.id, `Status changed to "${status}"`, prev, status);
      await onAfterChange?.(record, prev);
      toast.success(`Status updated to "${status}".`);
    } catch (err) {
      toast.error(err?.message || "Failed to update status.");
    }
  };

  const remove = async (record) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await base44.entities[entity].delete(record.id);
      await audit("Deleted", record.id, "Record deleted");
      toast.success("Record deleted successfully.");
    } catch (err) {
      toast.error(err?.message || "Failed to delete record.");
    }
  };

  const visible = statusFilter === "all" ? records : records.filter((r) => r.status === statusFilter);

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      <div className="px-4 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[#0F294A] text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statuses && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[140px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canAdd && (
            <Button size="sm" onClick={() => setOpen(true)} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
              <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel || "Add Record"}
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className="text-[#64748B]">{c.label}</TableHead>
              ))}
              <TableHead className="text-[#64748B]">Status</TableHead>
              <TableHead className="text-[#64748B] w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={columns.length + 2} className="text-center text-[#64748B] py-8">
                  <span className="inline-block w-5 h-5 border-2 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.length === 0 && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={columns.length + 2} className="text-center text-[#64748B] py-8">
                  No records yet.
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.map((record) => (
              <TableRow key={record.id} className="border-[#E2E8F0]">
                {columns.map((c) => (
                  <TableCell key={c.key} className="text-sm text-[#334155]">
                    {c.render ? c.render(record) : (record[c.key] ?? "—")}
                  </TableCell>
                ))}
                <TableCell>
                  {statuses && canEdit && canChangeRecord(user, record) ? (
                    <Select value={record.status || statuses[0]} onValueChange={(v) => changeStatus(record, v)}>
                      <SelectTrigger className="h-8 w-[140px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge status={record.status} />
                  )}
                </TableCell>
                <TableCell>
                  {canDelete && canChangeRecord(user, record) && (
                    <Button size="sm" variant="ghost" onClick={() => remove(record)} className="text-rose-600 hover:text-rose-600 hover:bg-rose-600/10 h-8 w-8 p-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AddRecordDialog
        open={open}
        onOpenChange={setOpen}
        title={addLabel || `Add ${title}`}
        fields={fields}
        onSubmit={handleAdd}
      />
    </div>
  );
}