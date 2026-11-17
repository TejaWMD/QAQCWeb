import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, ArrowRight } from "lucide-react";
import { loadProducts } from "@/lib/planning";
import { completenessSummary } from "@/lib/productMaster";

export default function ProductDataHealth() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    loadProducts()
      .then((rows) => { if (alive) setSummary(completenessSummary(rows)); })
      .catch(() => { if (alive) setSummary({ total: 0, complete: 0, incomplete: 0, percent: 0 }); });
    return () => { alive = false; };
  }, []);

  if (!summary || summary.total === 0) return null;

  const tone = summary.percent >= 90 ? "#00ff9d" : summary.percent >= 60 ? "#ff9f43" : "#ff4d4d";

  return (
    <div className="bg-[#131926] rounded-2xl border border-[#1e2740] px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}1a` }}>
        <Database className="w-4 h-4" style={{ color: tone }} />
      </div>
      <div className="min-w-[160px]">
        <h3 className="text-white text-sm font-semibold">Product Data</h3>
        <p className="text-[#94a3b8] text-xs">
          {summary.incomplete} of {summary.total} incomplete
        </p>
      </div>
      <div className="flex-1 min-w-[120px] h-2 rounded-full bg-[#0e131d] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${summary.percent}%`, backgroundColor: tone }} />
      </div>
      <span className="text-xs font-bold" style={{ color: tone }}>{summary.percent}%</span>
      <button
        type="button"
        onClick={() => navigate("/product-master?tab=completeness")}
        className="text-xs text-[#00e5ff] hover:underline inline-flex items-center gap-1 font-medium"
      >
        Review <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
