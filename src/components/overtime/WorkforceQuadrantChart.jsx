import React from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, ZAxis,
} from "recharts";
import { format } from "date-fns";

const MANPOWER_SPLIT = 35;
const OT_HIGH = 60;
const OT_LOW = 30;

const zoneOf = (manpower, otHrs) => {
  if (otHrs > OT_HIGH) return "High Overtime — Burnout & High Cost Risk";
  if (otHrs < OT_LOW) return "Low Overtime — Normal Baseline";
  return "Normal Zone";
};

const colorOf = (manpower, otHrs) => {
  if (otHrs > OT_HIGH) return "#ef4444";
  if (otHrs < OT_LOW) return "#22c55e";
  return "#f59e0b";
};

export default function WorkforceQuadrantChart({ data }) {
  const points = (data || [])
    .map((d) => ({
      ...d,
      x: d.manpower || 0,
      y: Number(d.hours.toFixed(1)),
      dateLabel: format(d.day, "MMM d"),
    }))
    .sort((a, b) => b.y - a.y);

  const maxX = Math.max(MANPOWER_SPLIT + 15, ...points.map((p) => p.x)) + 5;
  const maxY = Math.max(OT_HIGH + 20, ...points.map((p) => p.y)) + 10;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 16, right: 20, bottom: 24, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number" dataKey="x" name="Manpower"
          domain={[0, maxX]}
          label={{ value: "Manpower (staff/day)", position: "insideBottom", offset: -14, fontSize: 11, fill: "#64748b" }}
          tick={{ fontSize: 11, fill: "#64748b" }}
        />
        <YAxis
          type="number" dataKey="y" name="OT Hrs"
          domain={[0, maxY]}
          label={{ value: "OT Hrs/day", angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: "#64748b" }}
          tick={{ fontSize: 11, fill: "#64748b" }}
        />
        <ZAxis range={[80, 80]} />

        {/* Quadrant shading */}
        <ReferenceArea x1={MANPOWER_SPLIT} x2={maxX} y1={OT_HIGH} y2={maxY} fill="#fee2e2" fillOpacity={0.45} stroke="none" />
        <ReferenceArea x1={0} x2={maxX} y1={0} y2={OT_LOW} fill="#dcfce7" fillOpacity={0.35} stroke="none" />

        {/* Split lines */}
        <ReferenceLine x={MANPOWER_SPLIT} stroke="#94a3b8" strokeDasharray="6 4" />
        <ReferenceLine y={OT_HIGH} stroke="#ef4444" strokeDasharray="6 4" />
        <ReferenceLine y={OT_LOW} stroke="#22c55e" strokeDasharray="6 4" />

        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const p = payload[0].payload;
            return (
              <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                <p className="font-semibold text-slate-800 mb-1">{p.dateLabel}</p>
                <p className="text-slate-600">Manpower: <span className="font-medium text-slate-800">{p.manpower}</span></p>
                <p className="text-slate-600">OT Hours: <span className="font-medium text-amber-700">{p.y} hrs</span></p>
                <p className="text-slate-600">Sessions: <span className="font-medium text-slate-800">{p.count}</span></p>
                <p className={`mt-1 font-medium ${p.y > OT_HIGH ? "text-red-600" : p.y < OT_LOW ? "text-green-600" : "text-amber-600"}`}>{zoneOf(p.x, p.y)}</p>
              </div>
            );
          }}
        />

        <Scatter
          name="Daily OT"
          data={points}
          fill="#f59e0b"
          shape={(props) => {
            const { cx, cy, payload } = props;
            const color = colorOf(payload.x, payload.y);
            return (
              <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.88} stroke="#fff" strokeWidth={1.5} />
            );
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}