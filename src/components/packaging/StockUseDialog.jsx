import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fefoBatch, fmtQty, loadItemBatches, submitStockUse } from "@/lib/packaging";
import { loadMachineOptions, loadProductionOrderOptions } from "@/lib/masterOptions";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

export default function StockUseDialog({ open, item, user, orders = [], threshold = 0, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [batchKey, setBatchKey] = useState("none");
  const [form, setForm] = useState({ quantity: "", production_order: "", production_line: "", remarks: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [machineLines, setMachineLines] = useState([]);
  const [prodOrders, setProdOrders] = useState([]);

  useEffect(() => {
    if (!open || machineLines.length) return;
    Promise.all([loadMachineOptions(), loadProductionOrderOptions()])
      .then(([lines, po]) => { setMachineLines(lines); setProdOrders(po); })
      .catch(() => {});
  }, [open, machineLines.length]);

  useEffect(() => {
    if (!open || !item) return;
    setForm({ quantity: "", production_order: "", production_line: "", remarks: "" });
    setError("");
    setLoading(true);
    loadItemBatches(item.id)
      .then((result) => {
        setRows(result);
        const suggested = fefoBatch(result);
        setBatchKey(suggested ? suggested.key : "none");
      })
      .finally(() => setLoading(false));
  }, [open, item?.id]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const chosen = rows.find((r) => r.key === batchKey) || null;
  const qty = Number(form.quantity) || 0;
  const needsApproval = threshold > 0 && qty > threshold;
  const available = Number(item?.quantity) || 0;

  const save = async () => {
    if (!(qty > 0)) return setError("Quantity must be greater than zero.");
    if (qty > available) return setError(`Only ${fmtQty(available)} ${item.unit || ""} in stock.`);
    setError("");
    setSaving(true);
    try {
      const result = await submitStockUse({
        item,
        quantity: qty,
        user,
        threshold,
        extras: {
          batch_number: chosen?.batch_number || "",
          rack_location: chosen?.rack_location || "",
          production_order: form.production_order,
          production_line: form.production_line,
          remarks: form.remarks,
          source: "Stock use",
        },
      });
      onSaved?.(result);
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not record the stock use.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Use stock</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            {item ? `${item.item_code} · available ${fmtQty(available)} ${item.unit || ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Quantity *</label>
            <Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Batch</label>
            <Select value={batchKey} onValueChange={setBatchKey} disabled={loading}>
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder={loading ? "Loading..." : "No batch"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No batch</SelectItem>
                {rows.filter((r) => r.quantity > 0 && r.batch_number).map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.batch_number} · {fmtQty(r.quantity)} left{r.expiry_date ? ` · exp ${r.expiry_date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Production Order</label>
            <SearchableSelect
              value={form.production_order || ""}
              onValueChange={(v) => set("production_order", v)}
              options={[...prodOrders, ...orders]}
              placeholder="None"
              searchPlaceholder="Search order..."
              clearable
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Line</label>
            <SearchableSelect
              value={form.production_line || ""}
              onValueChange={(v) => set("production_line", v)}
              options={machineLines}
              placeholder="None"
              searchPlaceholder="Search line..."
              clearable
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Remarks</label>
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder="Optional" className={FIELD} />
          </div>
        </div>

        {chosen?.expiry_date && (
          <p className="text-[11px] text-emerald-700">Suggested by earliest expiry (FEFO): batch {chosen.batch_number} · {chosen.expiry_date}</p>
        )}
        {needsApproval && (
          <p className="text-[11px] text-amber-700">
            {fmtQty(qty)} is above the {fmtQty(threshold)} approval threshold — this issue will be sent to approvals instead of being deducted.
          </p>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">
            {saving ? "Saving..." : needsApproval ? "Send for approval" : "Record use"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}