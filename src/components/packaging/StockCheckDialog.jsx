import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { fmtQty, requestAdjustment } from "@/lib/packaging";

export default function StockCheckDialog({ open, item, user, onClose, onSaved }) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCounted("");
    setReason("");
    setError("");
  }, [open, item?.id]);

  const system = Number(item?.quantity) || 0;
  const difference = counted === "" ? 0 : (Number(counted) || 0) - system;

  const save = async () => {
    if (counted === "") return setError("Enter the counted quantity.");
    if (difference === 0) return setError("The counted quantity matches the system quantity — no adjustment needed.");
    setError("");
    setSaving(true);
    try {
      await requestAdjustment({ item, counted: Number(counted), user, reason });
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not raise the adjustment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Stock count</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            {item ? `${item.item_code} · system quantity ${fmtQty(system)} ${item.unit || ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Counted Quantity *</label>
            <Input type="number" min="0" step="0.001" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" className="bg-white border-[#E2E8F0] text-[#0F294A]" />
          </div>

          <div className={`rounded-lg border px-3 py-2 text-sm ${difference === 0 ? "border-[#E2E8F0] bg-white text-[#64748B]" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
            Difference: {difference > 0 ? "+" : ""}{fmtQty(difference)} {item?.unit || ""}
            {difference !== 0 && <span className="block text-[11px] mt-0.5">A stock adjustment request will be sent for approval.</span>}
          </div>

          {difference !== 0 && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Reason *</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the count differs" className="bg-white border-[#E2E8F0] text-[#0F294A]" />
            </div>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Cancel</Button>
          <Button type="button" onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            {saving ? "Saving..." : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}