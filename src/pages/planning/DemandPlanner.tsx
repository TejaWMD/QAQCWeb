import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import {
  calculateShortageAndPriority,
  generateBatchNumber,
  optimizeProductionSequence,
  PlanningCalculation,
} from '@/lib/planningCalc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calculator, Factory, Sparkles, CheckCircle2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';

const ForecastDialog = Dialog as React.ComponentType<any>;
const ForecastDialogContent = DialogContent as React.ComponentType<any>;
const ForecastDialogHeader = DialogHeader as React.ComponentType<any>;
const ForecastDialogTitle = DialogTitle as React.ComponentType<any>;
const ForecastDialogFooter = DialogFooter as React.ComponentType<any>;

export default function DemandPlanner() {
  const [rows, setRows] = useState<PlanningCalculation[]>([]);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [savingForecast, setSavingForecast] = useState(false);
  const [forecastForm, setForecastForm] = useState({
    product_id: '',
    forecast_quantity: '100',
    reorder_level: '50',
    buffer_percentage: '1.1',
    available_stock_cartons: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, recRes, invRes, planRes] = await Promise.all([
        supabase.from('products').select('*').eq('deleted', false),
        supabase.from('recipes').select('*').eq('deleted', false),
        supabase.from('finished_goods_inventory').select('*').eq('deleted', false),
        supabase.from('sales_planning').select('*').eq('deleted', false),
      ]);

      const recipesById = new Map((recRes.data || []).map((r: any) => [r.id, r]));
      const invByProd = new Map((invRes.data || []).map((i: any) => [i.product_id, i]));
      const planByProd = new Map((planRes.data || []).map((p: any) => [p.product_id, p]));

      const calculated = (prodRes.data || []).map((p: any) => {
        const rec: any = recipesById.get(p.recipe_id);
        const inv: any = invByProd.get(p.id);
        const plan: any = planByProd.get(p.id);

        const pcsPerCarton = Number(p.carton_size) || Number(p.pcs_per_carton) || 1;
        const netFilling = Number(p.net_filling_kg) || (Number(p.net_weight_kg) || 0.1) * pcsPerCarton;
        const batchOut = Number(p.batch_output_kg) || Number(rec?.batch_output_kg) || 200;
        const cookHr = Number(p.cooking_time_hr) || Number(rec?.cooking_time_hr) || 2;

        return calculateShortageAndPriority({
          productId: p.id,
          productCode: p.product_code || '',
          productName: p.product_name || '',
          brand: p.brand || '',
          batchPrefix: p.batch_prefix || rec?.batch_prefix || 'WMG',
          pcsPerCarton,
          netFillingKgPerCarton: netFilling,
          batchOutputKg: batchOut,
          cookingTimeHours: cookHr,
          currentStockCartons: Number(inv?.available_stock_cartons) || 0,
          reorderLevel: Number(plan?.reorder_level) || 0,
          forecastQty: Number(plan?.forecast_quantity) || 0,
        });
      });

      calculated.sort((a, b) => b.priorityScore - a.priorityScore);
      setRows(calculated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load planning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fillFromShortages = () => {
    const next: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.shortageCartons > 0) next[r.productId] = r.shortageCartons;
    });
    setSelectedQty(next);
    toast.success(`Populated ${Object.keys(next).length} products with stock shortages.`);
  };

  const plannedOrders = useMemo(() => {
    const list = rows
      .filter((r) => (selectedQty[r.productId] || 0) > 0)
      .map((r) => {
        const cartons = selectedQty[r.productId];
        const kg = Number((cartons * r.netFillingKgPerCarton).toFixed(2));
        const batches = r.batchOutputKg > 0 ? Math.ceil(kg / r.batchOutputKg) : 1;
        const hours = Number((batches * r.cookingTimeHours).toFixed(2));
        return {
          id: r.productId,
          row: r,
          cartons,
          planned_kg: kg,
          batches,
          run_time_hours: hours,
          priority: r.priority,
        };
      });
    return optimizeProductionSequence(list);
  }, [rows, selectedQty]);

  const handleGenerateOrders = async () => {
    if (plannedOrders.ordered.length === 0) {
      toast.error('Enter cartons > 0 for at least one product.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: existingOrders } = await supabase
        .from('production_orders')
        .select('order_number, batch_codes')
        .order('created_at', { ascending: false })
        .limit(100);

      const usedBatches: string[] = [];
      (existingOrders || []).forEach((o: any) => {
        if (Array.isArray(o.batch_codes)) usedBatches.push(...o.batch_codes);
      });

      const baseSeq = (existingOrders?.length || 0) + 1;
      const priorityMap: Record<string, string> = {
        critical: 'Urgent',
        high: 'High',
        medium: 'Normal',
        low: 'Low',
      };
      let cursorMs = new Date(`${productionDate}T08:00:00`).getTime();
      if (Number.isNaN(cursorMs)) cursorMs = Date.now();

      const inserts = plannedOrders.ordered.map((item, idx) => {
        const batchNo = generateBatchNumber(item.row.batchPrefix, productionDate, usedBatches);
        usedBatches.push(batchNo);
        const orderNo = `PO${productionDate.replace(/-/g, '').slice(2, 6)}${String(baseSeq + idx).padStart(3, '0')}`;
        const runMins = Math.max(30, Math.round((item.run_time_hours || 1) * 60));
        const startIso = new Date(cursorMs).toISOString();
        const endIso = new Date(cursorMs + runMins * 60000).toISOString();
        cursorMs += runMins * 60000;
        const batchCtns = item.row.netFillingKgPerCarton > 0
          ? Math.round(item.row.batchOutputKg / item.row.netFillingKgPerCarton)
          : item.cartons;

        return {
          order_number: orderNo,
          product_id: item.row.productId,
          product_code: item.row.productCode,
          product_name: item.row.productName,
          quantity_cartons: item.cartons,
          batch_cartons: batchCtns,
          batches: item.batches,
          batch_codes: [batchNo],
          priority: priorityMap[item.priority] || 'Normal',
          status: 'Planned',
          planned_start: startIso,
          planned_end: endIso,
          deleted: false,
        };
      });

      const { error } = await supabase.from('production_orders').insert(inserts);
      if (error) throw error;

      toast.success(`Generated ${inserts.length} sequenced production orders!`);
      setSelectedQty({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate production orders');
    } finally {
      setSubmitting(false);
    }
  };

  const openForecastModal = (row?: PlanningCalculation) => {
    setForecastForm({
      product_id: row?.productId || '',
      forecast_quantity: row ? String(row.forecastQty || 0) : '100',
      reorder_level: row ? String(row.reorderLevel || 0) : '50',
      buffer_percentage: '1.1',
      available_stock_cartons: row ? String(row.currentStockCartons || 0) : '',
    });
    setForecastOpen(true);
  };

  const handleSaveForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forecastForm.product_id) return toast.error('Select a product.');
    const targetRow = rows.find((r) => r.productId === forecastForm.product_id);
    if (!targetRow) return toast.error('Product not found.');

    setSavingForecast(true);
    try {
      const fQty = Number(forecastForm.forecast_quantity) || 0;
      const buf = Number(forecastForm.buffer_percentage) || 1.1;
      const reorder = Number(forecastForm.reorder_level) || 0;

      const { data: existingPlan } = await supabase
        .from('sales_planning')
        .select('id')
        .eq('product_id', targetRow.productId)
        .eq('deleted', false)
        .maybeSingle();

      const planPayload = {
        product_id: targetRow.productId,
        product_code: targetRow.productCode,
        forecast_quantity: fQty,
        reorder_level: reorder,
        buffer_percentage: buf,
        target_stock: Math.round(fQty * buf),
        monthly_sales: fQty,
        average_daily_sales: Number((fQty / 30).toFixed(2)),
        deleted: false,
      };

      const { error: planErr } = existingPlan?.id
        ? await supabase.from('sales_planning').update(planPayload).eq('id', existingPlan.id)
        : await supabase.from('sales_planning').insert(planPayload);
      if (planErr) throw planErr;

      if (forecastForm.available_stock_cartons !== '') {
        const ctns = Math.max(0, Number(forecastForm.available_stock_cartons) || 0);
        const pcs = Math.round(ctns * (targetRow.pcsPerCarton || 1));
        const { error: invErr } = await supabase.from('finished_goods_inventory').upsert(
          {
            product_id: targetRow.productId,
            product_code: targetRow.productCode,
            available_stock_cartons: ctns,
            current_stock_pcs: pcs,
            last_updated: new Date().toISOString(),
            deleted: false,
          },
          { onConflict: 'product_id' }
        );
        if (invErr) throw invErr;
      }

      toast.success(`Forecast updated for ${targetRow.productCode}`);
      setForecastOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save forecast.');
    } finally {
      setSavingForecast(false);
    }
  };

  const priorityColor: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 border-rose-200',
    high: 'bg-amber-100 text-amber-700 border-amber-200',
    medium: 'bg-blue-100 text-blue-700 border-blue-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-600" />
            Demand Planner & Order Sequence Optimizer
          </h1>
          <p className="text-sm text-slate-500">
            Calculates stock shortages vs. forecast & reorder levels, scores priority, and sequences production orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" onClick={() => openForecastModal()}>
            <Plus className="w-4 h-4 mr-1" />
            Set Forecast
          </Button>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="secondary" onClick={fillFromShortages}>
            <AlertTriangle className="w-4 h-4 mr-1" />
            Fill Shortages
          </Button>
          <Button onClick={handleGenerateOrders} disabled={submitting || plannedOrders.ordered.length === 0}>
            <Factory className="w-4 h-4 mr-1" />
            Generate {plannedOrders.ordered.length} Orders
          </Button>
        </div>
      </div>

      {plannedOrders.ordered.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Deterministic Sequence Preview ({plannedOrders.totalCookingHours} total cooking hrs)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-indigo-800 space-y-1">
            <p>{plannedOrders.summary}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {plannedOrders.ordered.map((o, i) => (
                <Badge key={o.id} variant="outline" className="bg-white">
                  #{i + 1} {o.row.productCode} ({o.cartons} ctns · {o.run_time_hours}h · {o.priority})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-slate-600">
              <tr>
                <th className="text-left p-3">Product</th>
                <th className="text-right p-3">Stock (Ctns)</th>
                <th className="text-right p-3">Reorder</th>
                <th className="text-right p-3">Forecast</th>
                <th className="text-right p-3">Shortage</th>
                <th className="text-center p-3">Priority</th>
                <th className="text-right p-3">Order Ctns</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.productId} className="hover:bg-slate-50/10">
                  <td className="p-3">
                    <div className="font-medium text-slate-900">{r.productName}</div>
                    <div className="text-xs text-slate-500">
                      {r.productCode} · {r.pcsPerCarton} pcs/ctn · {r.cookingTimeHours}h/batch
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono">{r.currentStockCartons}</td>
                  <td className="p-3 text-right font-mono">{r.reorderLevel}</td>
                  <td className="p-3 text-right font-mono">{r.forecastQty}</td>
                  <td className="p-3 text-right font-mono font-semibold text-rose-600">
                    {r.shortageCartons > 0 ? r.shortageCartons : <CheckCircle2 className="w-4 h-4 inline text-emerald-500" />}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className={priorityColor[r.priority]}>
                      {r.priority.toUpperCase()} ({r.priorityScore})
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      className="w-24 ml-auto text-right"
                      value={selectedQty[r.productId] ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setSelectedQty((prev) => {
                          const next = { ...prev };
                          if (raw === '') {
                            delete next[r.productId];
                          } else {
                            next[r.productId] = Math.max(0, Number(raw));
                          }
                          return next;
                        });
                      }}
                    />
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No active products found. Import or add products in Product Master first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ForecastDialog open={forecastOpen} onOpenChange={(v: boolean) => !v && !savingForecast && setForecastOpen(false)}>
        <ForecastDialogContent className="sm:max-w-md bg-white">
          <ForecastDialogHeader>
            <ForecastDialogTitle>Set Forecast & Reorder</ForecastDialogTitle>
          </ForecastDialogHeader>
          <form onSubmit={handleSaveForecast} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Product *</label>
              <SearchableSelect
                value={forecastForm.product_id}
                onValueChange={(v) => {
                  const found = rows.find((r) => r.productId === v);
                  setForecastForm({
                    product_id: v,
                    forecast_quantity: found ? String(found.forecastQty || 0) : '100',
                    reorder_level: found ? String(found.reorderLevel || 0) : '50',
                    buffer_percentage: '1.1',
                    available_stock_cartons: found ? String(found.currentStockCartons || 0) : '',
                  });
                }}
                options={rows.map((r) => ({ value: r.productId, label: `${r.productCode} — ${r.productName}` }))}
                placeholder="Select product..."
                searchPlaceholder="Search code or name..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Forecast (Ctns)</label>
                <Input
                  type="number"
                  min="0"
                  value={forecastForm.forecast_quantity}
                  onChange={(e) => setForecastForm({ ...forecastForm, forecast_quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Reorder Level</label>
                <Input
                  type="number"
                  min="0"
                  value={forecastForm.reorder_level}
                  onChange={(e) => setForecastForm({ ...forecastForm, reorder_level: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Buffer Multiplier</label>
                <Input
                  type="number"
                  step="0.05"
                  min="1"
                  value={forecastForm.buffer_percentage}
                  onChange={(e) => setForecastForm({ ...forecastForm, buffer_percentage: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Current Stock (Ctns)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Optional"
                  value={forecastForm.available_stock_cartons}
                  onChange={(e) => setForecastForm({ ...forecastForm, available_stock_cartons: e.target.value })}
                />
              </div>
            </div>
            <ForecastDialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setForecastOpen(false)} disabled={savingForecast}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingForecast}>
                {savingForecast ? 'Saving...' : 'Save'}
              </Button>
            </ForecastDialogFooter>
          </form>
        </ForecastDialogContent>
      </ForecastDialog>
    </div>
  );
}
