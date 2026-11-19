import React from "react";
import { base44 } from "@/api/base44Client";
import { canChangeRecord } from "@/lib/permissions";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/factoryops/StatusBadge";
import { Paperclip, Trash2 } from "lucide-react";
import { lineCode } from "@/lib/shiftLogConstants";
import { DOWNTIME_TYPE, ITEM_TYPE, TYPE_STYLES, statusesForType } from "@/lib/requestConstants";

const DemoBadge = () => (
  <span className="inline-block text-[10px] font-bold tracking-wider bg-amber-50 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5">DEMO</span>
);

const TypeBadge = ({ type }) => (
  <span className={`inline-block text-[10px] font-semibold tracking-wide border rounded px-1.5 py-0.5 ${TYPE_STYLES[type] || ""}`}>
    {type}
  </span>
);

const Details = ({ row }) => {
  if (row._type === DOWNTIME_TYPE) {
    return (
      <div>
        <p className="text-[#334155]">{row.reason || "—"}</p>
        {row.category && <p className="text-[#64748B] text-xs">{row.category}</p>}
      </div>
    );
  }
  if (row.request_type === ITEM_TYPE) {
    return (
      <div>
        <p className="text-[#334155]">{row.item_name || "—"}</p>
        <p className="text-[#64748B] text-xs">
          {row.quantity || "?"} {row.unit || ""} · needed by {row.needed_by_date || "—"}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[#334155]">{row.approval_type || "—"}</p>
      {row.description && <p className="text-[#64748B] text-xs">{row.description}</p>}
    </div>
  );
};

// One merged table for all three request types, each row tagged with its type.
export default function RequestsList({ rows, loading, user, onStatusChange, onRemove }) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent">
              <TableHead className="text-[#64748B]">Type</TableHead>
              <TableHead className="text-[#64748B]">Line</TableHead>
              <TableHead className="text-[#64748B]">Date</TableHead>
              <TableHead className="text-[#64748B]">Details</TableHead>
              <TableHead className="text-[#64748B]">Owner / Requester</TableHead>
              <TableHead className="text-[#64748B]">Status</TableHead>
              <TableHead className="text-[#64748B] w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={7} className="text-center text-[#64748B] py-8">
                  <span className="inline-block w-5 h-5 border-2 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={7} className="text-center text-[#64748B] py-8">
                  No requests yet.
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.map((row) => (
              <TableRow key={row.id} className="border-[#E2E8F0]">
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={row._type} />
                    {row.is_demo && <DemoBadge />}
                    {(row.evidence_files || []).length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          for (const f of row.evidence_files || []) {
                            const uri = typeof f === "string" ? f : f?.uri || f?.file_uri;
                            if (!uri) continue;
                            try {
                              const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
                              if (signed_url) window.open(signed_url, "_blank", "noopener,noreferrer");
                            } catch { /* ignore */ }
                          }
                        }}
                        title="Open attached evidence"
                        className="inline-flex items-center gap-0.5 text-[10px] text-[#1D4ED8] hover:underline border border-[#E2E8F0] bg-[#F8FAFC] rounded px-1.5 py-0.5 cursor-pointer"
                      >
                        <Paperclip className="w-3 h-3" />{row.evidence_files.length}
                      </button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#334155]">{lineCode(row.production_line || "") || "—"}</TableCell>
                <TableCell className="text-sm text-[#334155]">{row.shift_date || "—"}</TableCell>
                <TableCell><Details row={row} /></TableCell>
                <TableCell>
                  {row._type === DOWNTIME_TYPE ? (
                    <span className="text-sm text-[#334155]">
                      {(row.owners || []).length ? row.owners.join(", ") : row.owner || "—"}
                    </span>
                  ) : (
                    <div>
                      <p className="text-sm text-[#334155]">{(row.owners || []).join(", ") || "—"}</p>
                      <p className="text-[#64748B] text-xs">by {row.requester_name || "—"}</p>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {canChangeRecord(user, row) ? (
                    <Select value={row.status || statusesForType(row)[0]} onValueChange={(v) => onStatusChange(row, v)}>
                      <SelectTrigger className="h-8 w-[150px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusesForType(row).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge status={row.status} />
                  )}
                </TableCell>
                <TableCell>
                  {canChangeRecord(user, row) && (
                    <Button size="sm" variant="ghost" onClick={() => onRemove(row)} className="text-rose-600 hover:text-rose-600 hover:bg-rose-600/10 h-8 w-8 p-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}