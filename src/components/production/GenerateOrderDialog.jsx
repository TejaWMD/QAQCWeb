import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Plus, Trash2, Clock, ListOrdered, Flame, Save } from "lucide-react";
import { todayStr } from "@/lib/warehouse";
import { num } from "@/lib/planning";
import { recipeOf } from "@/lib/productLinks";
import {
  addMinutes, batchCount, buildBatchCodes, capacityOf, fmtDateTime, fmtQty,
  fromLocalInput, logProductionAudit, nextOrderNumber, runMinutes, suggestedMachine,
} from "@/lib/production";
import { inputClass, primaryButton, subtleButton, labelClass } from "@/components/planning/styles";

const AUTO_PRIORITY = ["High", "Medium", "Low"];

const PRIORITY_BADGE = {
  Critical: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
  High: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  Medium: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  Low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
  Normal: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
};

let seq = 0;
const blankRow = () => ({
  key: `row_${++seq}`,
  productId: "",
  cartons: "1",
  critical: false,
});

// Generate Order (V2):
// Only info entered: Today's Date, Delivery Date, Product (Item Description), Cartons Needed, and Priority.
// Critical items are scheduled first; remaining items sort by longest cooking time first
// (auto-distributing High -> Medium -> Low priority in the Production Sequence preview).
export default function GenerateOrderDialog({
  open,
  onClose,
  onSaved,
  products = [],
  machines = [],
  recipes = [],
  orders = [],
  settings,
  user,
}) {
  const { toast } = useToast();
  const [todayDate, setTodayDate] = useState(todayStr());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [items, setItems] = useState([blankRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTodayDate(todayStr());
    setDeliveryDate("");
    setItems([blankRow()]);
    setSaving(false);
  }, [open]);

  const productOptions = useMemo(() => {
    return [...products]
      .sort((a, b) => (a.product_name || "").localeCompare(b.product_name || "", undefined, { sensitivity: "base" }))
      .map((p) => ({
        value: p.id,
        label: [p.product_name, p.product_code].filter(Boolean).join(" · "),
        sublabel: p.recipe_name || p.brand || undefined,
      }));
  }, [products]);

  const setItem = (key, patch) =>
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeItem = (key) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const handleProductChange = (key, nextId) => {
    if (!nextId) {
      setItem(key, { productId: "" });
      return;
    }
    const existing = items.find((r) => r.productId === nextId && r.key !== key);
    if (existing) {
      const current = items.find((r) => r.key === key);
      const product = products.find((p) => p.id === nextId);
      const name = product?.product_name || "This product";
      if (window.confirm(`"${name}" is already selected (${existing.cartons || 0} cartons). Combine cartons into that row?`)) {
        const merged = (num(existing.cartons) || 0) + (num(current?.cartons) || 1);
        setItems((prev) => {
          const updated = prev.map((r) => (r.key === existing.key ? { ...r, cartons: String(merged) } : r));
          return updated.length > 1 ? updated.filter((r) => r.key !== key) : updated;
        });
        return;
      }
    }
    setItem(key, { productId: nextId });
  };

  // Single source of truth for per-row calculations (used in both Order Items & Production Sequence).
  const computedRows = useMemo(() => {
    return items.map((row) => {
      const product = products.find((p) => p.id === row.productId) || null;
      const cartons = num(row.cartons);
      if (!product) return { ...row, valid: false, cartons, product: null };

      const recipe = recipeOf(recipes, product);
      const machine = suggestedMachine(product, machines) || machines[0] || null;
      const cph = capacityOf(machine, settings);

      const netFillingPerCarton =
        num(product.net_filling_kg) ||
        (num(product.carton_size) * (num(product.net_weight_kg) || (num(product.target_net_weight_g) / 1000))) ||
        0;
      const requiredKg = Number((cartons * netFillingPerCarton).toFixed(1));

      const batchYieldKg =
        num(recipe?.batch_output_kg) ||
        num(recipe?.expected_output_kg) ||
        num(product.batch_output_kg);
      const cartonsPerBatch =
        num(product.cartons_per_batch) ||
        num(product.standard_batch_cartons);

      let batches = 1;
      if (batchYieldKg > 0 && requiredKg > 0) {
        batches = Math.max(1, Math.ceil(requiredKg / batchYieldKg));
      } else if (cartonsPerBatch > 0 && cartons > 0) {
        batches = Math.max(1, Math.ceil(cartons / cartonsPerBatch));
      } else {
        batches = batchCount(product, cartons) || 1;
      }

      const unitCookHr =
        num(recipe?.cooking_time_hr) ||
        num(recipe?.cooking_time_hours) ||
        num(product.cooking_time_hr) ||
        (num(product.cooking_time_min) ? num(product.cooking_time_min) / 60 : 0);

      const cookingHours = unitCookHr > 0
        ? Number((unitCookHr * batches).toFixed(1))
        : Number(((runMinutes(cartons, cph) || 60) / 60).toFixed(1));

      const recipeName = recipe?.recipe_name || product.recipe_name || "—";
      const incomplete = !(netFillingPerCarton > 0) && !(unitCookHr > 0);

      return {
        ...row,
        valid: cartons > 0,
        incomplete,
        product,
        recipe,
        recipeName,
        machine,
        cph,
        cartons,
        batches,
        cookingHours,
        requiredKg,
      };
    });
  }, [items, products, recipes, machines, settings]);

  // Sorted: manually-marked Critical first, then longest cooking time first (auto-assigning High / Medium / Low).
  const sequence = useMemo(() => {
    let nonCrit = 0;
    return computedRows
      .filter((r) => r.valid)
      .sort((a, b) => {
        if (!!a.critical !== !!b.critical) return a.critical ? -1 : 1;
        return b.cookingHours - a.cookingHours || b.batches - a.batches;
      })
      .map((r) => {
        const priority = r.critical
          ? "Critical"
          : AUTO_PRIORITY[Math.min(nonCrit, AUTO_PRIORITY.length - 1)];
        if (!r.critical) nonCrit += 1;
        return { ...r, priority };
      });
  }, [computedRows]);

  const save = async () => {
    if (!deliveryDate) {
      return toast({ title: "Select delivery date", description: "Please choose a Delivery Date before generating orders.", variant: "destructive" });
    }
    if (sequence.length === 0) {
      return toast({ title: "Add at least one item", description: "Select a product and enter cartons needed.", variant: "destructive" });
    }

    setSaving(true);
    try {
      const runningOrders = [...orders];
      let nextStart = fromLocalInput(`${todayDate || todayStr()}T08:00`);

      for (const row of sequence) {
        const orderNumber = nextOrderNumber(runningOrders);
        const minutes = Math.max(30, Math.round(row.cookingHours * 60));
        const endIso = addMinutes(nextStart, minutes);
        const codes = buildBatchCodes({
          code: row.product.product_code,
          plannedStart: nextStart,
          count: row.batches,
          pattern: settings?.batch_pattern,
        });

        const payload = {
          order_number: orderNumber,
          product_id: row.product.id,
          product_code: row.product.product_code || "",
          product_name: row.product.product_name || "",
          priority: row.priority || "Normal",
          quantity_cartons: row.cartons,
          batch_cartons: num(row.product.cartons_per_batch) || num(row.product.standard_batch_cartons) || 0,
          batches: row.batches,
          machine: row.machine?.name || row.product.default_machine || "",
          machine_id: row.machine?.id || "",
          capacity_cph: row.cph,
          due_date: deliveryDate || null,
          planned_start: nextStart,
          planned_end: endIso,
          status: "Planned",
          batch_codes: codes,
          plan_changes: [],
          notes: `Generated on ${todayDate || todayStr()}`,
          deleted: false,
        };

        const created = await base44.entities.ProductionOrder.create(payload);
        runningOrders.push(created || payload);
        await logProductionAudit({
          user,
          action: "Created",
          recordId: created?.id || "",
          details: `${orderNumber} · ${row.product.product_name} · ${fmtQty(row.cartons)} cartons · ${row.batches} batch(es)`,
          newValue: `${fmtDateTime(nextStart)} → ${fmtDateTime(endIso)}`,
        });
        nextStart = endIso;
      }

      toast({
        title: `${sequence.length} Order(s) generated`,
        description: `Sorted by longest cooking time first (${sequence.map((s) => s.product.product_code || s.product.product_name).join(", ")}).`,
      });
      await onSaved?.();
      onClose();
    } catch (e) {
      toast({ title: "Could not create order(s)", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#F8FAFC] border-[#E2E8F0] text-[#0F294A] max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F294A]">Generate Order</DialogTitle>
          <p className="text-xs text-[#64748B]">
            Create production orders manually — longest cooking time is scheduled first to finish earliest
          </p>
        </DialogHeader>

        {/* Card 1: Today's Date & Delivery Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
          <div className="space-y-1.5">
            <label className={labelClass}>Today&apos;s Date</label>
            <Input
              type="date"
              value={todayDate}
              onChange={(e) => setTodayDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Delivery Date</label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Card 2: Order Items */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#0F294A]">Order Items</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItems((p) => [...p, blankRow()])}
              className={subtleButton}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-2.5">
            {items.map((row, idx) => {
              const c = computedRows[idx];
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/60"
                >
                  <div className="md:col-span-6 space-y-1.5">
                    <label className={labelClass}>Product (Item Description)</label>
                    <SearchableSelect
                      value={row.productId}
                      onValueChange={(v) => handleProductChange(row.key, v)}
                      options={productOptions}
                      placeholder="Search by item description / code..."
                      searchPlaceholder="Search product name or item code..."
                      emptyText="No products found in Product Master."
                      clearable
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className={labelClass}>Cartons Needed</label>
                    <Input
                      type="number"
                      min="1"
                      value={row.cartons}
                      onChange={(e) => setItem(row.key, { cartons: e.target.value })}
                      className={inputClass}
                      placeholder="1"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className={labelClass}>Priority</label>
                    <button
                      type="button"
                      onClick={() => setItem(row.key, { critical: !row.critical })}
                      className={`w-full h-9 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        row.critical
                          ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
                          : "bg-white text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9]"
                      }`}
                      title="Toggle Critical priority (scheduled first)"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      {row.critical ? "Critical" : "Normal"}
                    </button>
                  </div>
                  <div className="md:col-span-1 flex items-center justify-center pb-1.5">
                    {c?.valid && (
                      c.incomplete ? (
                        <span
                          className="text-[10px] text-amber-600 text-center leading-tight font-medium"
                          title="Missing weight/cooking details — order can still be generated"
                        >
                          incomplete<br />data
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#64748B] text-center leading-tight whitespace-nowrap">
                          {c.batches} bch<br />{c.cookingHours}h
                        </span>
                      )
                    )}
                  </div>
                  <div className="md:col-span-1 flex justify-end pb-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() => removeItem(row.key)}
                      className="text-[#94A3B8] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 h-8 w-8"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 3: Production Sequence */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#0F294A] flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[#1D4ED8]" /> Production Sequence
            </span>
            <span className="text-xs text-[#64748B]">
              Sorted by longest cooking time first — so the longest jobs finish earliest
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="text-left font-semibold px-4 py-2.5 w-10">#</th>
                  <th className="text-left font-semibold px-4 py-2.5">Item Description</th>
                  <th className="text-left font-semibold px-4 py-2.5">Item Code</th>
                  <th className="text-left font-semibold px-4 py-2.5">Recipe</th>
                  <th className="text-right font-semibold px-4 py-2.5">Cartons</th>
                  <th className="text-right font-semibold px-4 py-2.5">Required KG</th>
                  <th className="text-right font-semibold px-4 py-2.5">Batches</th>
                  <th className="text-right font-semibold px-4 py-2.5">Cooking (h)</th>
                  <th className="text-left font-semibold px-4 py-2.5">Priority</th>
                </tr>
              </thead>
              <tbody>
                {sequence.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-[#64748B]">
                      Select a product and enter cartons needed to preview the sequence.
                    </td>
                  </tr>
                ) : (
                  sequence.map((row, idx) => {
                    const badge = PRIORITY_BADGE[row.priority] || PRIORITY_BADGE.Normal;
                    return (
                      <tr key={row.key} className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 text-[#1D4ED8] font-bold">{idx + 1}</td>
                        <td className="px-4 py-3 text-[#0F294A] font-semibold">
                          {row.product.product_name}
                          {row.incomplete && (
                            <span className="ml-2 text-[10px] text-amber-600 font-medium">incomplete data</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B]">{row.product.product_code || "—"}</td>
                        <td className="px-4 py-3 text-[#64748B]">{row.recipeName}</td>
                        <td className="px-4 py-3 text-right font-medium text-[#0F294A]">{fmtQty(row.cartons)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#1D4ED8]">
                          {row.requiredKg > 0 ? row.requiredKg.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0F294A]">{row.batches}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          <span className="inline-flex items-center justify-end gap-1">
                            <Clock className="w-3.5 h-3.5" /> {row.cookingHours}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {row.priority}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={onClose} className={subtleButton} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || sequence.length === 0 || !deliveryDate}
            className={primaryButton}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            {saving ? "Generating..." : `Generate ${sequence.length || 1} Order(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
