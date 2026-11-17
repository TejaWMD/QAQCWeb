import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, AlertTriangle, ArrowRight } from "lucide-react";
import { fmtQty, isLowStock } from "@/lib/packaging";

export default function PackagingLowStock() {
  const [low, setLow] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const page = await base44.entities.PackagingItem.filter({ active: true }, { limit: 500 });
      setLow((page.items || []).filter(isLowStock).sort((a, b) => Number(a.quantity) - Number(b.quantity)));
      setLoading(false);
    };
    load().catch(() => setLoading(false));
    const unsubscribe = base44.entities.PackagingItem.subscribe(() => load().catch(() => {}));
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  if (loading) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 shadow-sm ${
        low.length ? "border-[#ff9f43]/40 bg-[#ff9f43]/10" : "border-[#1e2740] bg-[#131926]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${low.length ? "bg-[#ff9f43]/20" : "bg-[#00e5ff]/10"}`}>
          {low.length ? <AlertTriangle className="w-4 h-4 text-[#ff9f43]" /> : <Package className="w-4 h-4 text-[#00e5ff]" />}
        </div>
        <h3 className="text-white text-sm font-semibold">Packaging Stock</h3>
        <p className={`text-xs ${low.length ? "text-[#ff9f43]" : "text-[#94a3b8]"}`}>
          {low.length ? `${low.length} low` : "All stocked"}
        </p>
        <Link
          to="/packaging-stock"
          className="ml-auto text-xs text-[#00e5ff] hover:underline inline-flex items-center gap-1 font-medium"
        >
          Stock <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {low.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {low.slice(0, 6).map((item) => (
            <span
              key={item.id}
              className="text-[11px] rounded-full border border-[#ff9f43]/30 bg-[#0e131d] px-2.5 py-0.5 text-[#e2e8f0]"
            >
              {item.item_code} · {fmtQty(item.quantity)}/{fmtQty(item.min_level)} {item.unit || ""}
            </span>
          ))}
          {low.length > 6 && <span className="text-[11px] text-[#94a3b8] self-center">+{low.length - 6}</span>}
        </div>
      )}
    </div>
  );
}
