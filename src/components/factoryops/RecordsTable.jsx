import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, canChangeRecord } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import AddRecordDialog from "@/components/factoryops/AddRecordDialog";
import StatusBadge from "@/components/factoryops/StatusBadge";
import { logSystemAction } from "@/lib/historyLog";
import { deleteEntityWithCleanup } from "@/lib/deleteIntegrity";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

// Generic records table for the FactoryOps modules: lists one entity,
// supports adding records, editing records, inline status changes (recording
// status_updated_at date & time), deletion, and AuditLog tracking.
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
  filterRows,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    return statuses && statuses.includes(fromUrl) ? fromUrl : "all";
  });

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await base44.entities[entity].list("-created_date", 200);
      setRecords(Array.isArray(data) ? data : []);
      if (markOverdue) {
        const today = new Date().toISOString().slice(0, 10);
        const ids = (Array.isArray(data) ? data : [])
          .filter((r) => markOverdue(r, today) && !["Overdue", "Completed", "Verified"].includes(r.status))
          .map((r) => r.id);
        if (ids.length > 0) {
          await base44.entities[entity].updateMany({ id: { $in: ids } }, { $set: { status: "Overdue" } });
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
    const nowIso = new Date().toISOString();
    const payload = {
      ...values,
      status: values.status || (statuses ? statuses[0] : "Open"),
      status_updated_at: nowIso,
      created_by: values.created_by || user?.email || user?.id || actingUserName(user),
    };
    const created = await base44.entities[entity].create(payload);
    await audit("Created", created?.id, `New record created in ${title}`);
    await onAfterCreate?.(created);
    await load(true);
  };

  const handleEdit = async (values) => {
    if (!editingRecord) return;
    const prevStatus = editingRecord.status || "";
    const nextStatus = values.status || prevStatus;
    if (nextStatus !== prevStatus && guard) {
      const error = guard({ ...editingRecord, ...values }, nextStatus);
      if (error) {
        throw new Error(error);
      }
    }
    const nowIso = new Date().toISOString();
    const statusChanged = nextStatus !== prevStatus;
    const patch = {
      ...values,
      ...(statusChanged ? { status_updated_at: nowIso } : {}),
      ...(statusChanged && nextStatus === "Verified"
        ? { verified_by: actingUserName(user), verification_date: nowIso }
        : {}),
    };
    const updated = await base44.entities[entity].update(editingRecord.id, patch);
    setRecords((prev) =>
      prev.map((r) =>
        r.id === editingRecord.id
          ? {
              ...r,
              ...patch,
              ...(updated || {}),
              ...(statusChanged ? { status_updated_at: nowIso, updated_date: nowIso } : {}),
            }
          : r
      )
    );
    await audit(
      "Updated",
      editingRecord.id,
      statusChanged
        ? `Record updated & status changed to "${nextStatus}" at ${eventStamp()}`
        : `Record updated in ${title}`,
      prevStatus,
      nextStatus
    );
    setEditingRecord(null);
    await load(true);
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
      const nowIso = new Date().toISOString();
      const patch = {
        status,
        status_updated_at: nowIso,
        ...(status === "Verified" ? { verified_by: actingUserName(user), verification_date: nowIso } : {}),
      };
      const updated = await base44.entities[entity].update(record.id, patch);
      setRecords((prevList) =>
        prevList.map((r) =>
          r.id === record.id
            ? { ...r, ...patch, ...(updated || {}), status_updated_at: nowIso, updated_date: nowIso }
            : r
        )
      );
      await audit("Updated", record.id, `Status changed to "${status}" at ${eventStamp()}`, prev, status);
      await onAfterChange?.(record, prev);
      toast.success(`Status updated to "${status}" (${new Date(nowIso).toLocaleString()}).`);
    } catch (err) {
      toast.error(err?.message || "Failed to update status.");
    }
  };

  const remove = async (record) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await deleteEntityWithCleanup(entity, record.id);
      await audit("Deleted", record.id, "Record deleted");
      await load(true);
      toast.success("Record deleted successfully.");
    } catch (err) {
      toast.error(err?.message || "Failed to delete record.");
    }
  };

  const editFields = statuses
    ? [
        ...fields,
        ...(fields.some((f) => f.key === "status")
          ? []
          : [{ key: "status", label: "Status", type: "select", options: statuses }]),
      ]
    : fields;

  const roleFiltered = filterRows ? records.filter(filterRows) : records;
  const visible = statusFilter === "all" ? roleFiltered : roleFiltered.filter((r) => r.status === statusFilter);

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
              <TableHead className="text-[#64748B] w-[90px] text-right">Actions</TableHead>
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
                <TableCell className="text-right whitespace-nowrap">
                  {canEdit && canChangeRecord(user, record) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingRecord(record)}
                      className="text-[#475569] hover:text-[#1D4ED8] hover:bg-[#EBF3FF] h-8 w-8 p-0 mr-1"
                      title="Edit record"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canDelete && canChangeRecord(user, record) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(record)}
                      className="text-rose-600 hover:text-rose-600 hover:bg-rose-600/10 h-8 w-8 p-0"
                      title="Delete record"
                    >
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
      <AddRecordDialog
        open={!!editingRecord}
        onOpenChange={(o) => !o && setEditingRecord(null)}
        title={`Edit ${title}`}
        fields={editFields}
        initialData={editingRecord}
        onSubmit={handleEdit}
      />
    </div>
  );
}
