import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";
import { fmtDay } from "@/lib/labels";
import { inputClass, primaryButton, subtleButton, labelClass } from "@/components/planning/styles";

// Asks how many copies to reprint before printing a saved batch again.
export default function ReprintDialog({ open, record, busy, onClose, onConfirm }) {
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    if (open) setCopies(1);
  }, [open, record]);

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Reprint labels</DialogTitle>
          <p className="text-xs text-[#64748B]">
            {record.product_name} · {record.batch_number} · exp {fmtDay(record.expiry_date)}
          </p>
        </DialogHeader>

        <div className="space-y-1">
          <label className={labelClass}>Number of copies</label>
          <Input type="number" min="1" max="200" value={copies} onChange={(e) => setCopies(e.target.value)} className={inputClass} />
          <p className="text-[11px] text-[#64748B]">Every reprint is logged with your name and the time.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className={subtleButton} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(Math.max(1, Math.round(Number(copies) || 1)))} disabled={busy} className={primaryButton}>
            <Printer className="w-4 h-4 mr-1.5" /> Print labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}