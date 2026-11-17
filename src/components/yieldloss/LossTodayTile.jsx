import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingDown } from "lucide-react";
import { todayStr } from "@/lib/warehouse";
import { loadBatchYields, loadReworks } from "@/lib/yieldLoss";

export default function LossTodayTile() {
  const [state, setState] = useState({ loading: true, yieldLoss: 0, rework: 0 });

  useEffect(() => {
    (async () => {
      const today = todayStr();
      const [yields, reworks] = await Promise.all([loadBatchYields(), loadReworks()]);
      const yieldLoss = yields
        .filter((r) => r.shift_date === today)
        .reduce((sum, r) => sum + Math.max(0, (r.input_kg || 0) - (r.output_kg || 0)), 0);
      const rework = reworks.filter((r) => r.rework_date === today).reduce((sum, r) => sum + (r.quantity_kg || 0), 0);
      setState({ loading: false, yieldLoss: Math.round(yieldLoss * 10) / 10, rework: Math.round(rework * 10) / 10 });
    })();
  }, []);

  const total = Math.round((state.yieldLoss + state.rework) * 10) / 10;

  return (
    <Link
      to="/yield-loss"
      className="block rounded-2xl border border-[#1e2740] bg-[#131926] px-4 py-3.5 hover:border-[#00e5ff]/60 transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#cbd5e1]">Loss Today</p>
        <div className="w-7 h-7 rounded-xl bg-[#ff9f43]/15 flex items-center justify-center">
          <TrendingDown className="w-4 h-4 text-[#ff9f43]" />
        </div>
      </div>
      <p className="text-xl font-bold text-white leading-tight mt-1">
        {state.loading ? "…" : `${total.toLocaleString("en-US")} kg`}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="text-xs text-[#94a3b8]">
          {state.loading ? "" : `${state.yieldLoss} kg yield · ${state.rework} kg rework`}
        </p>
        <span className="inline-flex items-center gap-1 text-xs text-[#00e5ff] font-medium shrink-0">
          Yield &amp; Loss <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
