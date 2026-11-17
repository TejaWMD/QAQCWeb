import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RotateCcw, Search } from "lucide-react";

const labelClass = "text-[10px] uppercase tracking-widest text-[#64748B] font-semibold";

export default function HistoryFilters({ filters, onChange, modules, actions, onExport, exportDisabled, count }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });
  const setSelect = (key) => (value) => onChange({ ...filters, [key]: value });
  const dirty = filters.from || filters.to || filters.actor !== "all" || filters.action !== "all" || filters.module !== "all" || filters.search;

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <span className={labelClass}>From</span>
          <Input type="date" value={filters.from} onChange={set("from")} className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-[148px]" />
        </div>
        <div className="space-y-1">
          <span className={labelClass}>To</span>
          <Input type="date" value={filters.to} onChange={set("to")} className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-[148px]" />
        </div>
        <div className="space-y-1">
          <span className={labelClass}>Performed by</span>
          <Select value={filters.actor} onValueChange={setSelect("actor")}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="User">Users only</SelectItem>
              <SelectItem value="System">System only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className={labelClass}>Action</span>
          <Select value={filters.action} onValueChange={setSelect("action")}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className={labelClass}>Module</span>
          <Select value={filters.module} onValueChange={setSelect("module")}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <span className={labelClass}>Search</span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={set("search")}
              placeholder="User, module, record or what changed"
              className="bg-white border-[#E2E8F0] text-[#0F294A] h-9 pl-8"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#64748B]">
          Showing <span className="text-[#0F294A] font-semibold">{count.toLocaleString()}</span> entries from the Audit Trail and Production Line Log.
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ from: "", to: "", actor: "all", action: "all", module: "all", search: "" })}
              className="text-[#64748B] hover:text-[#0F294A] hover:bg-[#F1F5F9]"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
          <Button onClick={onExport} disabled={exportDisabled} size="sm" className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}