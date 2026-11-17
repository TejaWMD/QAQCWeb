import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Clock, ListOrdered } from "lucide-react";
import { todayStr } from "@/lib/warehouse";
import { num } from "@/lib/planning";
import { scheduleBlock } from "@/lib/productMaster";
import { recipeOf } from "@/lib/productLinks";
import {
  PRIORITIES, addMinutes, batchCount, buildBatchCodes, capacityOf, fmtDateTime, fmtQty,
  fromLocalInput, logProductionAudit, nextOrderNumber, runMinutes, suggestedMachine,
} from "@/lib/production";
import { inputClass, selectClass, primaryButton, subtleButton, labelClass } from "@/components/planning/styles";

let seq = 0;
const blankRow = () => ({
  key: `row_${++seq}`,
  productId: "",
  cartons: "",
  priority: "Normal",
});

// Generate Order (V2): Today's Date, Delivery Date, Order Items (Product, Cartons Needed, Priority),
// and Production Sequence preview sorted by longest cooking time first.
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
  const [deliveryDate, setDeliveryDate] = useState(todayStr());
  const [items, setItems] = useState([blankRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTodayDate(todayStr());
    setDeliveryDate(todayStr());
    setItems([blankRow()]);
    setSaving(false);
  }, [open]);

  const setItem = (key, patch) =>
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeItem = (key) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  // Build preview rows with batches, required KG, cooking time (h), and sort longest cooking time first
  const sequence = useMemo(() => {
    return items
      .map((row) => {
        const product = products.find((p) => p.id === row.productId) || null;
        if (!product || !(num(row.cartons) > 0)) return null;
        const cartons = num(row.cartons);
        const recipe = recipeOf(recipes, product);
        const machine = suggestedMachine(product, machines) || machines[0] || null;
        const cph = capacityOf(machine, settings);
        const batches = batchCount(product, cartons) || 1;
        const cookingHours = recipe?.cooking_time_hours
          ? Number((num(recipe.cooking_time_hours) * batches).toFixed(1))
          : Number(((runMinutes(cartons, cph) || 60) / 60).toFixed(1));
        const requiredKg = Number((cartons * (num(product.net_filling_kg) || 0)).toFixed(1));
        return {
          ...row,
          product,
          recipe,
          machine,
          cph,
          cartons,
          batches,
          cookingHours,
          requiredKg,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.cookingHours - a.cookingHours);
  }, [items, products, recipes, machines, settings]);

  const save = async () => {
    if (sequence.length === 0) {
      return toast({ title: "Add at least one item", description: "Select a product and enter cartons needed.", variant: "destructive" });
    }
    for (const row of sequence) {
      const blocked = scheduleBlock(row.product);
      if (blocked) {
        return toast({
          title: "Product cannot be scheduled",
          description: `${row.product.product_name}: ${blocked}. Fix it in Product Master.`,
          variant: "destructive",
        });
      }
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
          batch_cartons: num(row.product.standard_batch_cartons),
          batches: row.batches,
          machine: row.machine?.name || row.product.default_machine || "",
          machine_id: row.machine?.id || "",
          capacity_cph: row.cph,
          due_date: deliveryDate || "",
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
        description: `Sorted by longest cooking time first (${sequence.map((s) => s.product.product_code).join(", ")}).`,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      toast({ title: "Could not create order(s)", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0b1018] border-[#1e2740] text-white max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Generate Order</DialogTitle>
          <p className="text-xs text-[#5f6b7f]">Create production orders manually — longest cooking time is scheduled first to finish earliest.</p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-[#1e2740] bg-[#0e131d] p-3">
          <div className="space-y-1">
            <label className={labelClass}>Today&apos;s Date</label>
            <Input type="date" value={todayDate} onChange={(e) => setTodayDate(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Delivery Date</label>
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="rounded-lg border border-[#1e2740] bg-[#0e131d] p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white">Order Items</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setItems((p) => [...p, blankRow()])} className={subtleButton}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((row) => {
              const product = products.find((p) => p.id === row.productId) || null;
              const recipe = product ? recipeOf(recipes, product) : null;
              const batches = product && num(row.cartons) > 0 ? (batchCount(product, row.cartons) || 1) : 0;
              const hrs = batches && recipe?.cooking_time_hours
                ? (num(recipe.cooking_time_hours) * batches).toFixed(1)
                : batches ? (batches * 1.3).toFixed(1) : null;
              return (
                <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <label className={labelClass}>Product (Item Description)</label>
                    <Select value={row.productId} onValueChange={(v) => setItem(row.key, { productId: v })}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue placeholder="Choose a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.length === 0 && <SelectItem value="none" disabled>No products in Product Master</SelectItem>}
                        {products.map((p) => {
                          const blocked = scheduleBlock(p);
                          return (
                            <SelectItem key={p.id} value={p.id} disabled={!!blocked}>
                              {p.product_name} · {p.product_code}{blocked ? " (blocked)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Cartons Needed</label>
                    <Input
                      type="number"
                      min="1"
                      value={row.cartons}
                      onChange={(e) => setItem(row.key, { cartons: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Priority</label>
                    <Select value={row.priority} onValueChange={(v) => setItem(row.key, { priority: v })}>
                      <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    {hrs && <span className="text-[11px] text-[#5f6b7f] whitespace-nowrap">{batches} bch · {hrs}h</span>}
                    {items.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(row.key)} className="text-[#ff4d4d] hover:bg-[#ff4d4d]/10 h-8 w-8">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[#1e2740] bg-[#0e131d] overflow-hidden">
          <div className="px-3 py-2 border-b border-[#1e2740] flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-[#00e5ff]" /> Production Sequence
            </span>
            <span className="text-[11px] text-[#5f6b7f]">Sorted by longest cooking time first — so the longest jobs finish earliest</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[#5f6b7f] border-b border-[#1e2740]">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Item Description</th>
                  <th className="text-left px-3 py-2">Item Code</th>
                  <th className="text-left px-3 py-2">Recipe</th>
                  <th className="text-right px-3 py-2">Cartons</th>
                  <th className="text-right px-3 py-2">Required KG</th>
                  <th className="text-right px-3 py-2">Batches</th>
                  <th className="text-right px-3 py-2">Cooking (h)</th>
                  <th className="text-left px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {sequence.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[#5f6b7f]">Select a product and enter cartons needed to preview the sequence.</td>
                  </tr>
                ) : (
                  sequence.map((row, idx) => (
                    <tr key={row.key} className="border-b border-[#1e2740]/50">
                      <td className="px-3 py-2 text-[#00e5ff] font-semibold">{idx + 1}</td>
                      <td className="px-3 py-2 text-white font-medium">{row.product.product_name}</td>
                      <td className="px-3 py-2 text-[#a0aec0]">{row.product.product_code}</td>
                      <td className="px-3 py-2 text-[#a0aec0]">{row.recipe?.recipe_name || "—"}</td>
                      <td className="px-3 py-2 text-right text-white">{fmtQty(row.cartons)}</td>
                      <td className="px-3 py-2 text-right text-[#ff9f43]">{row.requiredKg || "—"}</td>
                      <td className="px-3 py-2 text-right text-white">{row.batches}</td>
                      <td className="px-3 py-2 text-right text-[#00e5ff] inline-flex items-center justify-end gap-1 w-full">
                        <Clock className="w-3 h-3" /> {row.cookingHours}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          row.priority === "Urgent" ? "bg-[#ff4d4d]/15 text-[#ff4d4d]" :
                          row.priority === "High" ? "bg-[#ff9f43]/15 text-[#ff9f43]" :
                          "bg-[#1e2740] text-[#a0aec0]"
                        }`}>
                          {row.priority}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className={subtleButton} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || sequence.length === 0} className={primaryButton}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {saving ? "Generating..." : `Generate ${sequence.length || 1} Order(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
