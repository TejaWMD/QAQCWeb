import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Timer, DollarSign, Users } from "lucide-react";
import { otHoursAfterFive, timeOfDay } from "@/lib/otCalculations";
import { isOvertimeSyncRunning, otWindowStart, syncOvertimeFromOperationLogs } from "@/services/shiftLogService";
import OTSpendTrendChart from "@/components/otlog/OTSpendTrendChart";
import OTSpendByLineChart from "@/components/overtime/OTSpendByLineChart";
import WorkforceQuadrantChart from "@/components/overtime/WorkforceQuadrantChart";
import BatchBadge from "@/components/BatchBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function OvertimeRecord() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const reloadTimerRef = useRef(null);

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = batchFilter ? { record_batch: batchFilter } : {};
      const [otRes, opRes] = await Promise.all([
        base44.entities.OTLog.filter(query, { sort: "-created_date", limit: 300 }),
        base44.entities.OperationLog.filter(query, { sort: "-created_date", limit: 300 }),
      ]);
      const otRows = otRes.items || otRes || [];
      const opRows = opRes.items || opRes || [];
      const seenSessions = new Set(otRows.map((l) => l.session_id).filter(Boolean));
      const seenOpIds = new Set(otRows.map((l) => l.operation_log_id).filter(Boolean));

      const combined = [
        ...otRows,
        ...opRows.filter((op) => !seenOpIds.has(op.id) && (!op.session_id || !seenSessions.has(op.session_id))),
      ];

      const mapped = combined.map((l) => {
        const rawStart = l.start_time ? timeOfDay(l.start_time) : timeOfDay(l.ot_start) || "";
        const end = l.end_time ? timeOfDay(l.end_time) : timeOfDay(l.ot_end) || "";
        const winStart = otWindowStart(rawStart) || rawStart;
        const calcOt = Number(otHoursAfterFive(winStart, end).toFixed(2));
        return {
          ...l,
          shift_date: l.ot_date,
          start_time: winStart,
          end_time: end,
          break_duration: 0,
          ot_duration_hours: calcOt > 0 ? calcOt : Number(l.ot_duration_hours || 0),
        };
      });
      setLogs(mapped.filter((l) => l.ot_duration_hours > 0));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [batchFilter]);

  useEffect(() => {
    syncOvertimeFromOperationLogs().then((changed) => {
      if (changed) loadLogs(true);
    });
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    const scheduleReload = () => {
      if (isOvertimeSyncRunning()) return;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        loadLogs(true);
      }, 450);
    };
    const unsubscribes = [
      base44.entities.OTLog.subscribe(scheduleReload),
      base44.entities.OperationLog.subscribe(scheduleReload),
      base44.entities.ShiftLog.subscribe(scheduleReload),
    ];
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      unsubscribes.forEach((unsubscribe) => { if (typeof unsubscribe === "function") unsubscribe(); });
    };
  }, [loadLogs]);

  const { totalOTHours, totalOTSpend, totalSessions, dailySummary, maxDaySpend, lineSummary } = useMemo(() => {
    let otHrsSum = 0;
    let otSpendSum = 0;
    const dayMap = new Map();
    const lineMap = new Map();

    logs.forEach((l) => {
      const otHrs = l.ot_duration_hours || 0;
      const manHrs = otHrs * (l.staff_count || 0);
      const spend = manHrs * (l.hourly_ot_rate || 0);
      otHrsSum += manHrs;
      otSpendSum += spend;

      if (l.shift_date) {
        const datePart = String(l.shift_date).slice(0, 10);
        const day = new Date(`${datePart}T00:00:00`);
        if (!Number.isNaN(day.getTime())) {
          day.setHours(0, 0, 0, 0);
          const key = datePart;
          if (!dayMap.has(key)) dayMap.set(key, { key, day, hours: 0, spend: 0, count: 0, manpower: 0, manHours: 0, items: [] });
          const d = dayMap.get(key);
          d.hours += otHrs;
          d.manHours += manHrs;
          d.manpower += l.staff_count || 0;
          d.spend += spend;
          d.count += 1;
          d.items.push(l);
        }
      }

      const line = l.production_line?.split(" - ")[0] || "—";
      if (!lineMap.has(line)) lineMap.set(line, { line, spend: 0, hours: 0 });
      const ld = lineMap.get(line);
      ld.spend += spend;
      ld.hours += manHrs;
    });

    const dSummary = Array.from(dayMap.values()).sort((a, b) => b.day - a.day);
    return {
      totalOTHours: otHrsSum,
      totalOTSpend: otSpendSum,
      totalSessions: logs.length,
      dailySummary: dSummary,
      maxDaySpend: Math.max(...dSummary.map((d) => d.spend), 0),
      lineSummary: Array.from(lineMap.values()).sort((a, b) => b.spend - a.spend),
    };
  }, [logs]);

  const selectedDay = useMemo(
    () => (selectedDateKey ? dailySummary.find((d) => d.key === selectedDateKey) || null : null),
    [selectedDateKey, dailySummary]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const fmtTime = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 sm:p-6 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-[#0F294A]">Overtime Record</h2>
        <Select value={batchFilter || "all"} onValueChange={(v) => setBatchFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-44 bg-white">
            <SelectValue placeholder="All Batches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Batches</SelectItem>
            <SelectItem value="current">New Records</SelectItem>
            <SelectItem value="legacy">Legacy Records</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-slate-500 text-sm">No overtime records.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">OT Man-Hours</p>
                  <p className="text-2xl font-bold text-slate-800">{totalOTHours.toFixed(1)} hrs</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">OT Spend</p>
                  <p className="text-2xl font-bold text-slate-800">RM {totalOTSpend.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">OT Sessions</p>
                  <p className="text-2xl font-bold text-slate-800">{totalSessions}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">Daily OT Summary</h3>
              </div>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr className="text-slate-500 text-left">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium text-right">Sess.</th>
                      <th className="px-4 py-2 font-medium text-right">Manpower</th>
                      <th className="px-4 py-2 font-medium text-right">OT Hrs</th>
                      <th className="px-4 py-2 font-medium text-right">Man-Hrs</th>
                      <th className="px-4 py-2 font-medium text-right">Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailySummary.map((d) => {
                      const isMax = d.spend === maxDaySpend && maxDaySpend > 0;
                      return (
                        <tr
                          key={d.key}
                          onClick={() => setSelectedDateKey(d.key)}
                          className={`cursor-pointer transition-colors ${isMax ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-sky-50/70"}`}
                        >
                          <td className="px-4 py-2 text-[#1D4ED8] font-medium underline-offset-2 hover:underline">
                            {format(d.day, "dd/MM/yyyy")}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700">{d.count}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{d.manpower}</td>
                          <td className="px-4 py-2 text-right text-amber-700 font-medium">{d.hours.toFixed(1)}</td>
                          <td className="px-4 py-2 text-right text-sky-700 font-medium">{d.manHours.toFixed(1)}</td>
                          <td className={`px-4 py-2 text-right font-medium ${isMax ? "text-red-600" : "text-amber-600"}`}>
                            RM {d.spend.toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">OT Spend Trend</h3>
              </div>
              <div className="h-64">
                <OTSpendTrendChart data={dailySummary} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">OT Spend by Line</h3>
            </div>
            <div className="h-64">
              <OTSpendByLineChart data={lineSummary} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Workforce Efficiency Quadrant</h3>
            </div>
            <div className="h-96">
              <WorkforceQuadrantChart data={dailySummary} />
            </div>
          </div>
        </>
      )}

      {/* Daily OT Records Popup */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDateKey(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-w-5xl max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A] flex flex-wrap items-center gap-3">
              <span>{selectedDay ? format(selectedDay.day, "dd/MM/yyyy") : ""}</span>
              {selectedDay && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selectedDay.count} {selectedDay.count === 1 ? "session" : "sessions"}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700">
                    {selectedDay.manHours.toFixed(1)} man-hrs
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    RM {selectedDay.spend.toFixed(2)}
                  </span>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedDay && (
            <div className="overflow-auto flex-1 border border-slate-200 rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr className="text-slate-500 text-left">
                    <th className="px-3 py-2.5 font-medium">Batch</th>
                    <th className="px-3 py-2.5 font-medium">Line</th>
                    <th className="px-3 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium text-right">Staff</th>
                    <th className="px-3 py-2.5 font-medium">Names</th>
                    <th className="px-3 py-2.5 font-medium">Start</th>
                    <th className="px-3 py-2.5 font-medium">End</th>
                    <th className="px-3 py-2.5 font-medium text-right">OT Hrs</th>
                    <th className="px-3 py-2.5 font-medium text-right">Man-Hrs</th>
                    <th className="px-3 py-2.5 font-medium text-right">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDay.items.map((l) => {
                    const otHrs = l.ot_duration_hours || 0;
                    const otManHrs = otHrs * (l.staff_count || 0);
                    const otSpend = otManHrs * (l.hourly_ot_rate || 0);
                    const names = Array.isArray(l.staff_names) && l.staff_names.length ? l.staff_names.join(", ") : l.staff_name || "—";
                    return (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5"><BatchBadge value={l.record_batch} /></td>
                        <td className="px-3 py-2.5 text-slate-700">{l.production_line?.split(" - ")[0] || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">{l.product_name || "—"}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{l.staff_count || 0}</td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate" title={names}>{names}</td>
                        <td className="px-3 py-2.5 text-slate-600">{fmtTime(l.start_time)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{fmtTime(l.end_time)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600 font-medium">{otHrs.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{otManHrs.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600 font-medium">RM {otSpend.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
