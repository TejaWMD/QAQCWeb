import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Download, Lock } from "lucide-react";
import { MODULES } from "@/lib/permissions";
import { loadUserOptions } from "@/lib/masterOptions";

const ACTION_TONES = {
  Created: "text-[#1D4ED8]",
  Updated: "text-[#334155]",
  Deleted: "text-rose-600",
  Verified: "text-emerald-700",
};

const ACTIONS = ["all", "Created", "Updated", "Deleted", "Verified"];

// Audit Trail Log: read-only, automatically written by every module. Nobody can
// edit or delete entries. Includes date/module/user/action filters and CSV export.
export default function AuditTrailLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: "", to: "", module: "", user: "", action: "all" });
  const [userOpts, setUserOpts] = useState([]);

  useEffect(() => {
    loadUserOptions().then(setUserOpts).catch(() => {});
    const load = async () => {
      try {
        const data = await base44.entities.AuditLog.list("-created_date", 500);
        setLogs(data);
      } finally {
        setLoading(false);
      }
    };
    load();
    const unsubscribe = base44.entities.AuditLog.subscribe(() => load());
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const stamp = (l.event_stamp || l.event_time || "").slice(0, 10);
      if (filters.from && stamp < filters.from) return false;
      if (filters.to && stamp > filters.to) return false;
      if (filters.module && !(l.module || "").toLowerCase().includes(filters.module.toLowerCase())) return false;
      if (filters.user && !(l.user_name || "").toLowerCase().includes(filters.user.toLowerCase())) return false;
      if (filters.action !== "all" && l.action !== filters.action) return false;
      return true;
    });
  }, [logs, filters]);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Timestamp", "User", "Module", "Action", "Record ID", "Details", "Old Value", "New Value"];
    const rows = filtered.map((l) => [l.event_stamp, l.user_name, l.module, l.action, l.record_id, l.details, l.old_value, l.new_value]);
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const moduleOptions = useMemo(() => {
    const fromLogs = logs.map((l) => l.module).filter(Boolean);
    const fromConfig = MODULES.map((m) => m.label);
    return [...new Set([...fromLogs, ...fromConfig])].sort();
  }, [logs]);

  const userFilterOptions = useMemo(() => {
    const fromLogs = logs.map((l) => l.user_name).filter(Boolean);
    const fromUsers = userOpts.map((u) => u.value);
    return [...new Set([...fromUsers, ...fromLogs])].sort();
  }, [logs, userOpts]);

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Audit Trail Log</h2>
          <p className="text-[#64748B] text-sm mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" /> Read-only: every create, edit, delete, status change and verification is logged automatically.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={filtered.length === 0} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
          <Download className="w-4 h-4 mr-1" /> Export CSV ({filtered.length})
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 grid grid-cols-1 sm:flex sm:flex-wrap items-end gap-3">
        <div className="space-y-1 w-full sm:w-[150px]">
          <span className="text-[11px] text-[#64748B]">From</span>
          <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full" />
        </div>
        <div className="space-y-1 w-full sm:w-[150px]">
          <span className="text-[11px] text-[#64748B]">To</span>
          <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full" />
        </div>
        <div className="space-y-1 w-full sm:w-[190px]">
          <span className="text-[11px] text-[#64748B]">Module</span>
          <SearchableSelect
            value={filters.module}
            onValueChange={(v) => set("module", v)}
            options={moduleOptions}
            placeholder="All modules"
            searchPlaceholder="Search module..."
            allowCustom
            clearable
          />
        </div>
        <div className="space-y-1 w-full sm:w-[190px]">
          <span className="text-[11px] text-[#64748B]">User</span>
          <SearchableSelect
            value={filters.user}
            onValueChange={(v) => set("user", v)}
            options={userFilterOptions}
            placeholder="All users"
            searchPlaceholder="Search user..."
            allowCustom
            clearable
          />
        </div>
        <div className="space-y-1 w-full sm:w-[140px]">
          <span className="text-[11px] text-[#64748B]">Action</span>
          <Select value={filters.action} onValueChange={(v) => set("action", v)}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a === "all" ? "All Actions" : a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] hover:bg-transparent">
              <TableHead className="text-[#64748B] whitespace-nowrap">Timestamp</TableHead>
              <TableHead className="text-[#64748B]">User</TableHead>
              <TableHead className="text-[#64748B]">Module</TableHead>
              <TableHead className="text-[#64748B]">Action</TableHead>
              <TableHead className="text-[#64748B]">Record</TableHead>
              <TableHead className="text-[#64748B]">Details</TableHead>
              <TableHead className="text-[#64748B]">Old Value</TableHead>
              <TableHead className="text-[#64748B]">New Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={8} className="text-center py-8">
                  <span className="inline-block w-5 h-5 border-2 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow className="border-[#E2E8F0]">
                <TableCell colSpan={8} className="text-center text-[#64748B] py-8">No audit entries match the filters.</TableCell>
              </TableRow>
            )}
            {!loading && filtered.map((l) => (
              <TableRow key={l.id} className="border-[#E2E8F0]">
                <TableCell className="text-xs text-[#64748B] whitespace-nowrap">{l.event_stamp || l.event_time}</TableCell>
                <TableCell className="text-sm text-[#0F294A]">{l.user_name || "—"}</TableCell>
                <TableCell className="text-sm text-[#334155]">{l.module || "—"}</TableCell>
                <TableCell className={`text-sm font-medium ${ACTION_TONES[l.action] || "text-[#64748B]"}`}>{l.action}</TableCell>
                <TableCell className="text-xs text-[#64748B] max-w-[120px] truncate">{l.record_id || "—"}</TableCell>
                <TableCell className="text-sm text-[#334155] max-w-[260px]">{l.details || "—"}</TableCell>
                <TableCell className="text-xs text-amber-700 max-w-[120px] truncate">{l.old_value || "—"}</TableCell>
                <TableCell className="text-xs text-emerald-700 max-w-[120px] truncate">{l.new_value || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}