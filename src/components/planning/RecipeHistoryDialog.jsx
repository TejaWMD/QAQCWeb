import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtQty } from "@/lib/planning";
import { fmtDay } from "@/lib/labels";
import { dialogClass } from "@/components/planning/styles";

const STATUS_STYLES = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Superseded: "bg-[#3a4560]/20 text-[#64748B] border-[#3a4560]",
};

// History of one shared recipe: every item code that uses it is shown in the
// subtitle, and each saved version is listed newest first.
export default function RecipeHistoryDialog({ open, onClose, title, subtitle, versions = [] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Recipe history — {title}</DialogTitle>
          <p className="text-xs text-[#64748B]">{subtitle}</p>
        </DialogHeader>

        <div className="space-y-2">
          {versions.length === 0 && <p className="text-sm text-[#64748B]">No versions stored yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="rounded-lg border border-[#E2E8F0] bg-white p-3 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[#0F294A] font-semibold">
                  Version {v.version}
                  <span className="text-[#64748B] font-normal"> · {fmtQty(v.batch_cartons)} cartons / batch</span>
                </p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[v.status] || ""}`}>{v.status}</span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                {v.created_by || "—"} · {fmtDay(v.effective_date || v.created_date)}
                {v.standard_yield_pct ? ` · std yield ${fmtQty(v.standard_yield_pct)}%` : ""}
              </p>
              <ul className="text-xs text-[#64748B] space-y-0.5">
                {(v.ingredients || []).map((i, idx) => (
                  <li key={idx}>
                    {i.material_name || i.item_code || "Ingredient"} — {fmtQty(i.quantity_per_batch)} {i.unit || ""}
                  </li>
                ))}
              </ul>
              {v.notes && <p className="text-[11px] text-[#64748B]">{v.notes}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}