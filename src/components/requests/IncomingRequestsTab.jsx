import React from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/factoryops/StatusBadge";
import { lineCode } from "@/lib/shiftLogConstants";
import { ITEM_TYPE, TYPE_STYLES, URGENCY_STYLES, requestSummary } from "@/lib/requestConstants";

const URGENCY_RANK = { "Line stopped": 0, Urgent: 1, Normal: 2 };

// Requests routed to the current owner team, waiting on their decision. The
// parent already filters to the teams this member covers and excludes their
// own requests (nobody can approve their own request).
export default function IncomingRequestsTab({ requests, onReview }) {
  if (!requests.length) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] px-4 py-10 text-center text-[#64748B] text-sm">
        No incoming requests waiting on you right now.
      </div>
    );
  }

  const sorted = [...requests].sort(
    (a, b) =>
      (URGENCY_RANK[a.urgency] ?? 1) - (URGENCY_RANK[b.urgency] ?? 1) ||
      (b.shift_date || "").localeCompare(a.shift_date || "")
  );

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent">
              <TableHead className="text-[#64748B]">Type</TableHead>
              <TableHead className="text-[#64748B]">Line</TableHead>
              <TableHead className="text-[#64748B]">Requester</TableHead>
              <TableHead className="text-[#64748B]">Request</TableHead>
              <TableHead className="text-[#64748B]">Priority / Approval</TableHead>
              <TableHead className="text-[#64748B]">Needed By</TableHead>
              <TableHead className="text-[#64748B]">Status</TableHead>
              <TableHead className="text-[#64748B] w-[90px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id} className="border-[#E2E8F0]">
                <TableCell>
                  <span className={`inline-block text-[10px] font-semibold tracking-wide border rounded px-1.5 py-0.5 ${TYPE_STYLES[r.request_type] || ""}`}>
                    {r.request_type}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-[#334155]">{lineCode(r.production_line || "") || "—"}</TableCell>
                <TableCell className="text-sm text-[#334155]">{r.requester_name || "—"}</TableCell>
                <TableCell className="text-sm text-[#334155]">{requestSummary(r)}</TableCell>
                <TableCell>
                  {r.request_type === ITEM_TYPE ? (
                    <span className={`inline-block text-[10px] font-semibold border rounded px-1.5 py-0.5 ${URGENCY_STYLES[r.urgency] || URGENCY_STYLES.Normal}`}>
                      {r.urgency || "Normal"}
                    </span>
                  ) : (
                    <span className="text-sm text-[#334155]">{r.approval_type || "—"}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-[#334155]">{r.needed_by_date || r.requested_datetime || "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => onReview(r)} className="bg-[#0F294A] hover:bg-[#193B68] text-white h-7 text-xs">
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}