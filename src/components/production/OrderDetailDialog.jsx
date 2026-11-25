import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Play, CheckCircle2, Trash2, Ban, Pencil, Save } from "lucide-react";
import { actingUserName } from "@/lib/permissions";
import {
  PRIORITIES, ORDER_STATUSES, batchCount, buildRisks, canDeleteOrders, canPlanOrders, canRunOrders,
  fmtDateTime, fmtDuration, fmtQty, fmtRange, fmtTime, logProductionAudit,
} from "@/lib/production";
import { activeRecipeFor } from "@/lib/recipeMaster";
import { fmtDay } from "@/lib/labels";
import { inputClass, selectClass, primaryButton, subtleButton, labelClass } from "@/components/planning/styles";

const STATUS_STYLES = {
  Planned: "bg-[#EBF3FF] text-[#1D4ED8] border-[#BFD7FF]",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-300",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Cancelled: "bg-[#3a4560]/20 text-[#64748B] border-[#3a4560]",
};

const RiskList = ({ title, rows, emptyText }) => (
  <div>
    <p className={labelClass}>{title}</p>
    {rows.length === 0 ? (
      <p className="text-xs text-[#64748B] mt-1">{emptyText}</p>
    ) : (
      <ul className="mt-1 space-y-1">
        {rows.map((r) => (
          <li key={`${r.code}-${r.needed}`} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-[#64748B] truncate">{r.name}</span>
            <span className={`whitespace-nowrap ${r.short ? "text-rose-600" : "text-[#64748B]"}`}>
              need {fmtQty(r.needed)} / have {r.available == null ? "none" : fmtQty(r.available)} {r.unit}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// Full order view: details, batch numbers, planned vs actual, stock risk and the
// Start / Finish / Cancel / Delete actions.
export default function OrderDetailDialog({ order, products = [], recipes = [], packagingItems = [], receipts = [], user, onClose, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    quantity_cartons: String(order?.quantity_cartons ?? ""),
    priority: order?.priority || "Normal",
    due_date: (order?.due_date || "").slice(0, 10),
    status: order?.status || "Planned",
  });

  const startEdit = () => {
    setEditForm({
      quantity_cartons: String(order?.quantity_cartons ?? ""),
      priority: order?.priority || "Normal",
      due_date: (order?.due_date || "").slice(0, 10),
      status: order?.status || "Planned",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const qty = Number(editForm.quantity_cartons);
    if (!(qty > 0)) {
      toast({ title: "Invalid cartons", description: "Cartons must be greater than zero.", variant: "destructive" });
      return;
    }
    const nextBatches = product ? (batchCount(product, qty) || 1) : (order.batches || 1);
    await run(
      {
        quantity_cartons: qty,
        batches: nextBatches,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
        status: editForm.status,
      },
      "Updated",
      `${order.order_number} updated (${fmtQty(qty)} cartons · ${editForm.priority})`
    );
    setEditing(false);
  };

  const product = products.find((p) => p.id === order?.product_id) || null;
  const recipe = activeRecipeFor(recipes, product || order?.product_id);
  const risks = buildRisks({ order, product, recipe, packagingItems, receipts });
  const plannedMins = order?.planned_end
    ? Math.round((new Date(order.planned_end).getTime() - new Date(order.planned_start).getTime()) / 60000)
    : 0;
  const variance = order?.actual_end && order?.planned_end
    ? Math.round((new Date(order.actual_end).getTime() - new Date(order.planned_end).getTime()) / 60000)
    : null;

  const run = async (patch, action, details, closeAfter) => {
    setBusy(true);
    try {
      await base44.entities.ProductionOrder.update(order.id, patch);
      await logProductionAudit({ user, action, recordId: order.id, details });
      toast({ title: details });
      onChanged?.();
      if (closeAfter) onClose();
    } catch (e) {
      toast({ title: "Could not update the order", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(
    { status: "In Progress", actual_start: order.actual_start || new Date().toISOString() },
    "Started",
    `${order.order_number} started on ${order.machine}`
  );

  const finish = () => {
    const now = new Date().toISOString();
    return run(
      { status: "Completed", actual_start: order.actual_start || now, actual_end: now },
      "Completed",
      `${order.order_number} finished on ${order.machine}`
    );
  };

  const cancel = () => run({ status: "Cancelled" }, "Cancelled", `${order.order_number} cancelled`);

  const remove = () => run(
    { deleted: true, deleted_by: actingUserName(user), deleted_date: new Date().toISOString() },
    "Deleted",
    `${order.order_number} moved to Recently Deleted`,
    true
  );

  if (!order) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-[#0F294A]">{order.order_number}</DialogTitle>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[order.status] || STATUS_STYLES.Planned}`}>{order.status}</span>
            {order.priority && order.priority !== "Normal" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#E2E8F0] text-[#64748B]">{order.priority}</span>
            )}
          </div>
          <p className="text-sm text-[#64748B]">{order.product_code} · {order.product_name}</p>
        </DialogHeader>

        {editing ? (
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelClass}>Cartons Needed</label>
                <Input
                  type="number"
                  min="1"
                  value={editForm.quantity_cartons}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity_cartons: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Delivery Date</label>
                <Input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Priority</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} className={subtleButton} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={busy} className={primaryButton}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className={labelClass}>Cartons</p><p className="text-[#0F294A]">{fmtQty(order.quantity_cartons)}</p></div>
            <div><p className={labelClass}>Batches</p><p className="text-[#0F294A]">{order.batches || 1}</p></div>
            <div><p className={labelClass}>Machine (Tank)</p><p className="text-[#0F294A] text-xs leading-5">{order.machine || "—"}</p></div>
            <div><p className={labelClass}>Priority</p><p className="text-[#0F294A] text-xs leading-5">{order.priority || "Normal"}</p></div>
            <div><p className={labelClass}>Planned</p><p className="text-[#0F294A] text-xs leading-5">{fmtDateTime(order.planned_start)}</p><p className="text-[11px] text-[#64748B]">to {fmtDateTime(order.planned_end)}</p></div>
            <div><p className={labelClass}>Actual</p><p className="text-[#0F294A] text-xs leading-5">{order.actual_start ? fmtDateTime(order.actual_start) : "not started"}</p><p className="text-[11px] text-[#64748B]">{order.actual_end ? `to ${fmtTime(order.actual_end)}` : ""}</p></div>
            <div><p className={labelClass}>Run time</p><p className="text-[#0F294A] text-xs leading-5">{plannedMins ? fmtDuration(plannedMins) : "—"}</p></div>
            <div><p className={labelClass}>Delivery Date</p><p className="text-[#0F294A] text-xs leading-5">{order.due_date ? fmtDay(order.due_date) : "—"}</p></div>
          </div>
        )}

        {variance != null && (
          <p className={`text-xs ${variance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            Finished {fmtDuration(Math.abs(variance))} {variance > 0 ? "later" : "earlier"} than planned.
          </p>
        )}

        {(order.batch_codes || []).length > 0 && (
          <div>
            <p className={labelClass}>Batch numbers</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {order.batch_codes.map((c) => (
                <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-[#EBF3FF] text-[#1D4ED8] border border-[#BFD7FF]">{c}</span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RiskList
            title="Materials at risk"
            rows={risks.materials}
            emptyText={risks.hasRecipe ? "No ingredients on the active recipe." : "No active recipe for this product."}
          />
          <RiskList
            title="Packaging at risk"
            rows={risks.packaging}
            emptyText="No packaging per carton set on the product."
          />
        </div>

        {(risks.materialsShort.length > 0 || risks.packagingShort.length > 0) && (
          <div className="rounded-lg border border-rose-300 bg-rose-600/10 p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600">
              Short on {[...risks.materialsShort, ...risks.packagingShort].map((r) => r.name).join(", ")}. Materials are compared with goods received in the warehouse.
            </p>
          </div>
        )}

        {(order.plan_changes || []).length > 0 && (
          <div>
            <p className={labelClass}>Plan changes</p>
            <ul className="mt-1 space-y-1">
              {order.plan_changes.slice().reverse().map((c, i) => (
                <li key={`${c.changed_at}-${i}`} className="text-xs text-[#64748B]">
                  <span className="text-[#64748B]">{c.changed_by}</span> moved it to {c.to_machine} on {fmtDateTime(c.to_start)} — {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {order.notes && <p className="text-xs text-[#64748B]">{order.notes}</p>}

        <DialogFooter className="sm:flex-wrap gap-2.5 pt-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-[#ff8a8a] sm:mr-auto self-center">Move this order to Recently Deleted?</span>
              <Button variant="outline" onClick={() => setConfirmDelete(false)} className={subtleButton} disabled={busy}>Keep</Button>
              <Button onClick={remove} disabled={busy} className="bg-rose-600 hover:bg-[#d93b3b] text-white font-semibold">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />} Delete
              </Button>
            </>
          ) : (
            <>
              {canDeleteOrders(user) && order.status !== "Completed" && (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-[#ff8a8a] hover:bg-rose-600/10 sm:mr-auto">
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              )}
              {canPlanOrders(user) && !editing && !["Completed", "Cancelled"].includes(order.status) && (
                <Button variant="outline" onClick={startEdit} disabled={busy} className={subtleButton}>
                  <Pencil className="w-4 h-4 mr-1.5" /> Edit
                </Button>
              )}
              {canPlanOrders(user) && ["Planned", "In Progress"].includes(order.status) && (
                <Button variant="outline" onClick={cancel} disabled={busy} className={subtleButton}>
                  <Ban className="w-4 h-4 mr-1.5" /> Cancel order
                </Button>
              )}
              {canRunOrders(user) && order.status === "Planned" && (
                <Button onClick={start} disabled={busy} className={primaryButton}>
                  <Play className="w-4 h-4 mr-1.5" /> Start
                </Button>
              )}
              {canRunOrders(user) && order.status === "In Progress" && (
                <Button onClick={finish} disabled={busy} className={primaryButton}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Finish
                </Button>
              )}
              {order.status === "Completed" && <span className="text-xs text-emerald-700 sm:mr-auto self-center">Completed {order.actual_end ? fmtTime(order.actual_end) : ""}</span>}
              <Button variant="outline" onClick={onClose} className={subtleButton}>Close</Button>
            </>
          )}
        </DialogFooter>
        <p className="text-[11px] text-[#64748B]">{fmtRange(order.planned_start, order.planned_end)} planned</p>
      </DialogContent>
    </Dialog>
  );
}