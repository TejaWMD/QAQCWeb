import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Recycle } from "lucide-react";
import { fmtDay } from "@/lib/labels";
import { fmtKg, loadReworks } from "@/lib/yieldLoss";
import { panelClass, labelClass } from "@/components/planning/styles";

const same = (a, b) => (a || "").trim().toUpperCase() === (b || "").trim().toUpperCase();

// Rework lots touching this batch: raised from it, or reused into it.
export default function ReworkTraceList({ batchNumber }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    loadReworks().then((all) => {
      setRows(
        (all || []).filter((r) => same(r.source_batch, batchNumber) || same(r.reused_batch, batchNumber))
      );
    });
  }, [batchNumber]);

  if (!batchNumber || rows.length === 0) return null;

  return (
    <div className={`${panelClass} p-4`}>
      <p className={`${labelClass} flex items-center gap-1 mb-2`}>
        <Recycle className="w-3 h-3" /> Rework lots
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const isSource = same(r.source_batch, batchNumber);
          const other = isSource ? r.reused_batch : r.source_batch;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-b border-[#E2E8F0] last:border-0 pb-1.5 last:pb-0">
              <span className="text-[#1D4ED8] font-semibold">{r.rework_lot_id}</span>
              <span className="text-[#64748B]">{isSource ? "raised from this batch" : "reused into this batch"}</span>
              <span className="text-[#0F294A]">{fmtKg(r.quantity_kg)}</span>
              <span className="text-[#64748B]">{r.reason}</span>
              <span className="text-[#64748B]">{r.disposition}</span>
              {other && (
                <Link to={`/traceability?batch=${encodeURIComponent(other)}`} className="text-[#1D4ED8] hover:underline">
                  {other}
                </Link>
              )}
              <span className="text-[#64748B]">{fmtDay(r.rework_date)}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                r.qa_clearance === "Cleared"
                  ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                  : r.qa_clearance === "Rejected"
                    ? "text-rose-600 border-rose-300 bg-rose-600/10"
                    : "text-amber-700 border-amber-300 bg-amber-50"
              }`}>
                QA {r.qa_clearance || "Pending"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}