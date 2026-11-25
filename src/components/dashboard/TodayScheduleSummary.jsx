import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowRight, CalendarDays } from "lucide-react";
import { loadMachines } from "@/lib/planning";
import { loadOrders } from "@/lib/production";
import { todaysSchedule } from "@/lib/batchTrace";

const TILES = [
  { key: "planned", label: "Planned", tone: "text-[#00e5ff] border-[#00e5ff]/25 bg-[#00e5ff]/10" },
  { key: "completed", label: "Completed", tone: "text-[#00ff9d] border-[#00ff9d]/25 bg-[#00ff9d]/10" },
  { key: "delayed", label: "Delayed", tone: "text-[#ff4d4d] border-[#ff4d4d]/25 bg-[#ff4d4d]/10" },
];

export default function TodayScheduleSummary() {
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [orderRows, machineRows] = await Promise.all([loadOrders(), loadMachines()]);
      if (!active) return;
      setOrders(orderRows);
      setMachines(machineRows);
      setLoading(false);
    };
    load();
    const unsubscribe = base44.entities.ProductionOrder.subscribe(() => load());
    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const summary = useMemo(() => todaysSchedule({ orders, machines }), [orders, machines]);

  return (
    <div className="bg-[#131926] rounded-2xl border border-[#1e2740] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-[#00e5ff]/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-[#00e5ff]" />
          </div>
          <h3 className="text-white text-sm font-semibold">Today's Schedule</h3>
          <span className="text-xs text-[#94a3b8]">
            {loading ? "…" : `${summary.total} order${summary.total === 1 ? "" : "s"}`}
          </span>
        </div>
        <Link
          to="/production-schedule"
          className="text-xs text-[#00e5ff] hover:underline inline-flex items-center gap-1 font-medium"
        >
          Schedule <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {TILES.map((tile) => (
          <div key={tile.key} className={`rounded-2xl border px-3.5 py-2.5 ${tile.tone}`}>
            <p className="text-[11px] font-medium opacity-90">{tile.label}</p>
            <p className="text-xl font-bold leading-tight mt-0.5">{summary[tile.key]}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[#94a3b8] font-medium mr-1">
          Idle ({summary.idle.length}):
        </span>
        {loading ? (
          <span className="text-xs text-[#94a3b8]">—</span>
        ) : summary.idle.length === 0 ? (
          <span className="text-xs text-[#00ff9d]">All machines active</span>
        ) : (
          summary.idle.map((name) => (
            <span
              key={name}
              className="text-[11px] px-2.5 py-0.5 rounded-full border border-[#1e2740] bg-[#0e131d] text-[#cbd5e1]"
            >
              {name}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
