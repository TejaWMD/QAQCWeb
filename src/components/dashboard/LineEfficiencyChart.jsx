import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { EFFICIENCY_TARGET } from "@/lib/dashboardMetrics";

export default function LineEfficiencyChart({ data }) {
  const lowest = data.length ? data.reduce((min, d) => d.actual < min.actual ? d : min, data[0]) : null;
  const met = data.filter((d) => d.actual >= EFFICIENCY_TARGET).length;

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-[#0F294A]">Line Efficiency Rate</h3>
        <span className="text-xs text-slate-500">Target {EFFICIENCY_TARGET}%</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Actual vs target (%)</p>
      <div className="flex-1 min-h-[180px]">
        {data.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">No output recorded yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} barGap={4} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="effGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0d9488" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8f0e2" />
              <XAxis dataKey="line" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => `${v}%`} />
              <ReferenceLine y={EFFICIENCY_TARGET} stroke="#dc2626" strokeDasharray="4 4" />
              <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="url(#effGradient)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 text-xs sm:text-sm">
        <span className="text-slate-600">Met target: <span className="font-semibold text-green-600">{met}/{data.length}</span></span>
        {lowest && <span className="text-red-500 font-medium">Lowest: {lowest.line} ({lowest.actual}%)</span>}
      </div>
    </div>
  );
}