import React from "react";
import { AlertTriangle, ClipboardCheck, Clock, PackageMinus, PackagePlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import { fmtQty, isLowStock } from "@/lib/packaging";

export default function ItemCard({ item, status, canEdit, canDelete, onIn, onUse, onCheck, onEdit, onDelete, onDetail }) {
  const inactive = item.active === false;
  const low = isLowStock(item) || status === "Low stock" || status === "No stock";
  const unitLabel = String(item.unit || "PCS").toUpperCase();
  const minVal = Number(item.min_level) || 0;
  const curVal = Number(item.quantity) || 0;
  const suggestedRestock = low && minVal > 0 ? Math.max(minVal * 2 - curVal, minVal) : 0;

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-shadow hover:shadow-sm ${
        low ? "border-rose-300 bg-rose-50/20" : "border-[#E2E8F0] bg-white"
      } ${inactive ? "opacity-60" : ""}`}
    >
      {/* Top Row: Item Name + Low Badge + Edit / Delete buttons */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDetail}
              className="text-left text-[#0F294A] text-sm font-bold uppercase tracking-tight hover:underline truncate"
            >
              {item.description || item.name || item.item_code}
            </button>
            {low && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500 text-white text-[11px] font-semibold">
                <AlertTriangle className="w-3 h-3" /> Low
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            {item.category || "Packaging"}
            {inactive ? " · inactive" : ""}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-lg text-[#475569] hover:text-[#0F294A] hover:bg-slate-100"
              title="Edit item"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
              title="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Middle: Quantity + Min + Suggested Restock */}
      <div className="space-y-1.5">
        <p className={`text-2xl font-bold leading-none ${low ? "text-rose-600" : "text-[#0F294A]"}`}>
          {fmtQty(item.quantity)}{" "}
          <span className="text-xs text-[#64748B] font-normal uppercase">{unitLabel}</span>
        </p>
        <p className="text-xs text-[#64748B]">
          Min: {fmtQty(minVal)} {unitLabel}
        </p>
        {suggestedRestock > 0 && (
          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-medium">
              <Sparkles className="w-3 h-3 text-amber-600" />
              Suggested restock: {fmtQty(suggestedRestock)} {unitLabel}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Row: Status pill on left, In / Use / Check buttons on right (Matches Picture 13) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[#64748B] text-[11px]">
          <Clock className="w-3 h-3" />
          {status === "Pending approval"
            ? "Pending approval"
            : item.order_status && item.order_status !== "no_action"
            ? item.order_status.replace(/_/g, " ")
            : "No action yet"}
        </span>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onIn}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-xs font-semibold text-[#0F294A] transition-colors"
          >
            <PackagePlus className="w-3.5 h-3.5 text-emerald-600" /> In
          </button>
          <button
            type="button"
            onClick={onUse}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-xs font-semibold text-[#0F294A] transition-colors"
          >
            <PackageMinus className="w-3.5 h-3.5 text-rose-500" /> Use
          </button>
          <button
            type="button"
            onClick={onCheck}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-xs font-semibold text-[#0F294A] transition-colors"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" /> Check
          </button>
        </div>
      </div>
    </div>
  );
}
