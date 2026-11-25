import React from "react";

const STYLES = {
  Open: "bg-[#1e2740] text-[#e2e8f0]",
  Pending: "bg-[#1e2740] text-[#e2e8f0]",
  Submitted: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  "In Progress": "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  "Under Review": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  "Awaiting Approval": "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  "To Be Discussed": "bg-orange-500/15 text-orange-300 border border-orange-500/30",
  "Pending Verification": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  "Returned for more info": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  Completed: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  Rejected: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  Verified: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  Approved: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  Resolved: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  Active: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
};

// Color-coded pill for the standard record statuses.
export default function StatusBadge({ status }) {
  if (!status) return <span className="text-sm text-[#a0aec0]">—</span>;
  const cls = STYLES[status] || "bg-[#1e2740] text-[#a0aec0]";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}