import React, { useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { ACTION_TONES } from "@/components/history/historyRows";
import { formatDateHeader, groupByDate } from "@/lib/logGrouping";

const ActionBadge = ({ action }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${ACTION_TONES[action] || "text-[#64748B] border-[#3b4a68] bg-[#F1F5F9]"}`}>
    {action || "—"}
  </span>
);

const DetailLines = ({ row }) => {
  const lines = [...row.changes];
  if (!lines.length && (row.oldValue || row.newValue)) lines.push(`${row.oldValue || "—"} → ${row.newValue || "—"}`);
  return (
    <div className="px-4 py-3 bg-white border-t border-[#E2E8F0] space-y-1">
      {lines.length === 0 && <p className="text-xs text-[#64748B]">No field-level changes were recorded for this entry.</p>}
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-[#334155]">• {line}</p>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-[#64748B]">
        <span>Log: {row.source}</span>
        {row.entity && <span>Data table: {row.entity}</span>}
        {row.recordId && <span className="truncate max-w-[280px]">Record: {row.recordId}</span>}
      </div>
    </div>
  );
};

export default function HistoryTable({ rows, loading }) {
  const [open, setOpen] = useState({});
  const toggle = (id) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white py-16 flex justify-center">
        <span className="w-6 h-6 border-2 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white py-16 text-center">
        <p className="text-[#64748B] text-sm">No history entries match these filters.</p>
        <p className="text-[#64748B] text-xs mt-1">Every action taken in the app is recorded here automatically.</p>
      </div>
    );
  }

  const groups = groupByDate(rows, "day");

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
      <div className="overflow-x-auto max-h-[68vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white border-b border-[#E2E8F0]">
            <tr className="text-left text-[11px] uppercase tracking-widest text-[#64748B]">
              <th className="px-3 py-2.5 font-semibold w-8"></th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Time</th>
              <th className="px-3 py-2.5 font-semibold">Performed by</th>
              <th className="px-3 py-2.5 font-semibold">Module</th>
              <th className="px-3 py-2.5 font-semibold">Action</th>
              <th className="px-3 py-2.5 font-semibold">Details</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.date}>
              <tr className="bg-white border-y border-[#E2E8F0]">
                <td colSpan={6} className="px-3 py-2">
                  <span className="text-xs font-semibold text-[#0F294A]">{formatDateHeader(group.date)}</span>
                  <span className="text-[11px] text-[#64748B] ml-2">
                    {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                  </span>
                </td>
              </tr>
              {group.items.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="border-b border-[#161d2b] hover:bg-white/[0.03] cursor-pointer" onClick={() => toggle(row.id)}>
                    <td className="px-2 py-2 text-[#64748B]">
                      {open[row.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#64748B] whitespace-nowrap">{row.time || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-sm text-[#0F294A]">{row.actor}</span>
                      {row.actorType === "System" && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] border border-[#BFD7FF] px-1.5 py-0.5 text-[10px] text-[#1D4ED8]">
                          <Zap className="w-2.5 h-2.5" /> System
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-[#334155]">{row.module || "—"}</td>
                    <td className="px-3 py-2"><ActionBadge action={row.action} /></td>
                    <td className="px-3 py-2 text-sm text-[#64748B] max-w-[460px] truncate" title={row.details}>{row.details || "—"}</td>
                  </tr>
                  {open[row.id] && (
                    <tr className="border-b border-[#161d2b]">
                      <td colSpan={6} className="p-0"><DetailLines row={row} /></td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}