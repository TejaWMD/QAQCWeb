import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { fmtQty, submitStockUse } from "@/lib/packaging";
import { todayStr } from "@/lib/warehouse";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

export default function StockUseDialog({ open, item, user, threshold = 0, onClose, onSaved }) {
  const [form, setForm] = useState({ date: todayStr(), quantity: "", remarks: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setForm({ date: todayStr(), quantity: "", remarks: "" });
    setError("");
  }, [open, item?.id]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
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
          movement_date: form.date || todayStr(),
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
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Date *</label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Quantity *</label>
            <Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" className={FIELD} />
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