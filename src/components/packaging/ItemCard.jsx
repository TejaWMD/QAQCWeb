import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Pencil, Trash2, Layers } from "lucide-react";
import { fmtQty } from "@/lib/packaging";

const STATUS_STYLES = {
  "Low stock": "bg-amber-50 text-amber-700 border-amber-300",
  "Pending approval": "bg-[#EBF3FF] text-[#1D4ED8] border-[#BFD7FF]",
  "No stock": "bg-rose-600/15 text-rose-600 border-rose-300",
  "In stock": "bg-emerald-50 text-emerald-700 border-emerald-300",
};

export default function ItemCard({ item, status, canEdit, canDelete, onIn, onUse, onCheck, onEdit, onDelete, onDetail }) {
  const inactive = item.active === false;
  return (
    <div className={`rounded-xl border border-[#E2E8F0] bg-white p-3 flex flex-col gap-3 ${inactive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[#0F294A] text-sm font-semibold truncate">{item.description || item.item_code}</p>
          <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
            {item.item_code}
            {item.category ? ` · ${item.category}` : ""}
            {inactive ? " · inactive" : ""}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES["In stock"]}`}>
          {status}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl text-[#0F294A] font-semibold leading-none">
            {fmtQty(item.quantity)} <span className="text-xs text-[#64748B] font-normal">{item.unit || ""}</span>
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            Min {fmtQty(item.min_level)} {item.unit || ""} · Rack {item.default_rack || "—"}
          </p>
          {status === "Low stock" && Number(item.min_level) > 0 && (
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Suggested restock: {fmtQty(Math.max(Number(item.min_level) * 2 - (Number(item.quantity) || 0), Number(item.min_level)))} {item.unit || ""}
            </p>
          )}
          <p className="text-[10px] text-[#64748B] mt-1">
            {item.order_status && item.order_status !== "no_action" ? item.order_status.replace(/_/g, " ") : "No action yet"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDetail} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]" title="Batches & racks">
          <Layers className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" onClick={onIn} className="bg-emerald-500 hover:bg-[#00e08a] text-[#0F294A] font-semibold">
          <ArrowDownToLine className="w-3.5 h-3.5" /> In
        </Button>
        <Button size="sm" onClick={onUse} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">
          <ArrowUpFromLine className="w-3.5 h-3.5" /> Use
        </Button>
        <Button size="sm" onClick={onCheck} className="bg-amber-500 hover:bg-[#f58a1f] text-[#0F294A] font-semibold">
          <ClipboardCheck className="w-3.5 h-3.5" /> Check
        </Button>
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-[#E2E8F0] pt-2">
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-rose-600 hover:bg-rose-600/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}