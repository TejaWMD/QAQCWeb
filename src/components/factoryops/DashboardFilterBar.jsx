import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, RotateCcw } from "lucide-react";
import { productionLines } from "@/lib/shiftLogConstants";

export default function DashboardFilterBar({ date, shift, line, status, onChange, onReset }) {
  return (
    <div className="bg-[#131926] rounded-2xl border border-[#1e2740] p-3 sm:px-4 sm:py-3 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5">
      <div className="hidden lg:flex items-center justify-center w-8 h-8 rounded-full bg-[#00e5ff]/10 text-[#00e5ff] shrink-0">
        <Filter className="w-4 h-4" />
      </div>
      <Input
        type="date"
        value={date}
        onChange={(e) => onChange("date", e.target.value)}
        aria-label="Filter by date"
        className="w-full lg:w-[155px] rounded-full bg-[#0e131d] border-[#1e2740] text-white text-xs h-9 px-3.5"
      />
      <Select value={shift} onValueChange={(v) => onChange("shift", v)}>
        <SelectTrigger className="w-full lg:w-[150px] rounded-full bg-[#0e131d] border-[#1e2740] text-white text-xs h-9 px-3.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Shifts</SelectItem>
          <SelectItem value="Morning">Shift A (Day)</SelectItem>
          <SelectItem value="Night">Shift B (Night)</SelectItem>
        </SelectContent>
      </Select>
      <Select value={line} onValueChange={(v) => onChange("line", v)}>
        <SelectTrigger className="w-full lg:w-[210px] rounded-full bg-[#0e131d] border-[#1e2740] text-white text-xs h-9 px-3.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Lines</SelectItem>
          {productionLines.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(v) => onChange("status", v)}>
        <SelectTrigger className="w-full lg:w-[140px] rounded-full bg-[#0e131d] border-[#1e2740] text-white text-xs h-9 px-3.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="Open">Open</SelectItem>
          <SelectItem value="Overdue">Overdue</SelectItem>
          <SelectItem value="Verified">Verified</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={onReset}
        title="Reset filters"
        aria-label="Reset filters"
        className="justify-self-end lg:ml-auto h-9 w-9 rounded-full text-[#cbd5e1] hover:text-white hover:bg-white/10"
      >
        <RotateCcw className="w-4 h-4" />
      </Button>
    </div>
  );
}
