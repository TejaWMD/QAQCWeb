import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, ShieldCheck } from "lucide-react";
import BatchYieldDialog from "@/components/yieldloss/BatchYieldDialog";
import { panelClass, primaryButton, labelClass } from "@/components/planning/styles";
import { actingUserName } from "@/lib/permissions";
import { loadProducts, loadRecipes } from "@/lib/planning";
import { loadBatchRecords } from "@/lib/labels";
import { loadOrders } from "@/lib/production";
import { fmtDay } from "@/lib/labels";
import {
  canEnterYieldLoss, canVerifyRecord, fmtKg, fmtPct, loadBatchYields, loadIssues, logYieldAudit,
} from "@/lib/yieldLoss";

export default function BatchYieldTab({ settings }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState({ yields: [], records: [], products: [], recipes: [], orders: [], movements: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [yields, records, products, recipes, orders, movements] = await Promise.all([
      loadBatchYields(), loadBatchRecords(), loadProducts(), loadRecipes(), loadOrders(), loadIssues(),
    ]);
    setData({ yields, records, products, recipes, orders, movements });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const verify = async (record) => {
    await base44.entities.BatchYield.update(record.id, {
      status: "Verified",
      verified_by: actingUserName(user),
      verified_date: new Date().toISOString(),
    });
    await logYieldAudit({
      user,
      action: "Verified",
      recordId: record.id,
      details: `Yield for batch ${record.batch_number} verified at ${fmtPct(record.yield_pct)}`,
      oldValue: "Draft",
      newValue: "Verified",
    });
    toast({ title: "Yield verified", description: record.batch_number });
    load();
  };

  if (loading) {
    return <div className={`${panelClass} p-8 text-center text-sm text-[#64748B]`}>Loading batch yields…</div>;
  }

  const rows = data.yields;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#64748B]">
          {rows.length} yield record{rows.length === 1 ? "" : "s"} · tolerance ±{settings.yield_tolerance_pct}% below standard
        </p>
        {canEnterYieldLoss(user) && (
          <Button onClick={() => setOpen(true)} className={primaryButton}><Plus className="w-4 h-4 mr-1" /> New yield entry</Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className={`${panelClass} p-8 text-center`}>
          <p className="text-sm text-[#64748B]">No batch yields recorded yet.</p>
          <p className="text-xs text-[#64748B] mt-1">Open a batch, enter its ingredient input and the output kg is calculated from Product Master.</p>
        </div>
      ) : (
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#64748B] text-[10px] uppercase tracking-widest">
                <th className="px-3 py-2 text-left font-semibold">Batch</th>
                <th className="px-3 py-2 text-left font-semibold">Product</th>
                <th className="px-3 py-2 text-left font-semibold">Line · date</th>
                <th className="px-3 py-2 text-right font-semibold">Input kg</th>
                <th className="px-3 py-2 text-right font-semibold">Output kg</th>
                <th className="px-3 py-2 text-right font-semibold">Yield %</th>
                <th className="px-3 py-2 text-right font-semibold">Std %</th>
                <th className="px-3 py-2 text-right font-semibold">Variance</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 text-[#0F294A] font-medium whitespace-nowrap">{r.batch_number}</td>
                  <td className="px-3 py-2 text-[#64748B]">{r.product_name}</td>
                  <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{r.production_line || "—"} · {fmtDay(r.shift_date)}</td>
                  <td className="px-3 py-2 text-right text-[#334155]">
                    {fmtKg(r.input_kg)}
                    <span className={`block text-[10px] ${r.input_source === "Manual" ? "text-amber-700" : "text-[#64748B]"}`} title={r.override_reason || ""}>
                      {r.input_source === "Manual" ? "manual override" : "goods issued"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[#334155]">{fmtKg(r.output_kg)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${r.within_tolerance ? "text-emerald-700" : "text-rose-600"}`}>{fmtPct(r.yield_pct)}</td>
                  <td className="px-3 py-2 text-right text-[#64748B]">{r.standard_yield_pct ? fmtPct(r.standard_yield_pct) : "—"}</td>
                  <td className={`px-3 py-2 text-right ${r.within_tolerance ? "text-[#64748B]" : "text-rose-600 font-semibold"}`}>
                    {r.variance_pct > 0 ? "+" : ""}{r.variance_pct ?? 0}%
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                      r.status === "Verified"
                        ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                        : "text-[#64748B] border-[#E2E8F0] bg-white/5"
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canVerifyRecord(user, r) && (
                      <Button size="sm" variant="outline" onClick={() => verify(r)} className="border-[#E2E8F0] bg-transparent text-[#64748B] hover:text-[#0F294A]">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verify
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={labelClass}>Input kg comes from the goods issued to the batch. Output kg = cartons × carton size × net weight from Product Master.</p>

      <BatchYieldDialog
        open={open}
        onClose={() => setOpen(false)}
        settings={settings}
        records={data.records}
        products={data.products}
        recipes={data.recipes}
        orders={data.orders}
        movements={data.movements}
        yields={data.yields}
        onSaved={load}
      />
    </div>
  );
}