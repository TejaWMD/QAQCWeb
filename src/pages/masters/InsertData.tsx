import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { productService } from '@/services/productService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { PlusCircle, Package, BookOpen, TrendingUp, Boxes, Cpu, Trash2, AlertTriangle, Upload } from 'lucide-react';
import {
  archiveMachineSafely,
  archiveProductSafely,
  archiveRecipeSafely,
} from '@/lib/deleteIntegrity';
import {
  loadMachineLocationOptions,
  loadMachineOptions,
  loadPackagingCategoryOptions,
  loadProductSettingsOptions,
  loadUnitOptions,
} from '@/lib/masterOptions';

type DeleteTarget = {
  type: 'product' | 'recipe' | 'forecast' | 'packaging' | 'machine';
  id: string;
  label: string;
  warning: string;
  item?: any;
};

export default function InsertData() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [packagingItems, setPackagingItems] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [opts, setOpts] = useState<{
    brands: any[];
    channels: any[];
    categories: any[];
    units: any[];
    lineOptions: any[];
    locations: any[];
  }>({ brands: [], channels: [], categories: [], units: [], lineOptions: [], locations: [] });

  const [prod, setProd] = useState<Record<string, any>>({
    product_code: '',
    product_name: '',
    brand: '',
    recipe_id: '',
    default_machine: '',
    carton_size: '24',
    net_weight_kg: '0.2',
    cooking_time_hr: '2',
    batch_output_kg: '500',
    batch_prefix: '',
    shelf_life_months: '12',
    barcode: '',
    carton_barcode: '',
    customer: 'GENERAL',
  });

  const [rec, setRec] = useState<Record<string, any>>({
    recipe_name: '',
    brand: '',
    batch_prefix: '',
    cooking_time_hr: '2',
    batch_output_kg: '500',
    shelf_life_months: '12',
  });

  const [forecast, setForecast] = useState<Record<string, any>>({
    product_id: '',
    forecast_quantity: '100',
    reorder_level: '50',
    buffer_percentage: '1.1',
    available_stock_cartons: '0',
  });

  const [pkg, setPkg] = useState<Record<string, any>>({
    item_code: '',
    name: '',
    category: 'Packaging Raw Material',
    unit: 'pcs',
    current_stock: '',
    safety_stock: '50',
  });

  const [machine, setMachine] = useState<Record<string, any>>({
    name: '',
    location: '',
    capacity_cph: '100',
    status: 'Active',
  });

  const loadLookups = async () => {
    const [r, m, p, pk, f, ps, cats, units, lineOpts, locs] = await Promise.all([
      supabase.from('recipes').select('*').eq('deleted', false).order('recipe_name'),
      supabase.from('machines').select('*').eq('deleted', false).order('name'),
      supabase.from('products').select('*').eq('deleted', false).order('product_name'),
      supabase.from('packaging_items').select('*').eq('deleted', false).order('created_at', { ascending: false }),
      supabase.from('sales_planning').select('*').order('created_at', { ascending: false }).limit(50),
      loadProductSettingsOptions(),
      loadPackagingCategoryOptions(),
      loadUnitOptions(),
      loadMachineOptions(),
      loadMachineLocationOptions(),
    ]);
    setRecipes(r.data || []);
    setMachines(m.data || []);
    setProducts(p.data || []);
    setPackagingItems(pk.data || []);
    setForecasts(f.data || []);
    setOpts({
      brands: ps.brands,
      channels: ps.channels,
      categories: cats,
      units,
      lineOptions: lineOpts,
      locations: locs,
    });
  };

  useEffect(() => {
    loadLookups();
  }, []);

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prod.product_code.trim() || !prod.product_name.trim()) {
      return toast.error('Product code and product name are required.');
    }
    const selectedRec = recipes.find((r) => r.id === prod.recipe_id);
    try {
      await productService.createProduct({
        product_code: prod.product_code,
        product_name: prod.product_name,
        brand: prod.brand,
        recipe_id: prod.recipe_id || null,
        recipe_name: selectedRec?.recipe_name || '',
        default_machine: prod.default_machine,
        carton_size: Number(prod.carton_size) || 0,
        net_weight_kg: Number(prod.net_weight_kg) || 0,
        cooking_time_hr: Number(prod.cooking_time_hr) || 0,
        batch_output_kg: Number(prod.batch_output_kg) || 0,
        batch_prefix: prod.batch_prefix,
        shelf_life_months: Number(prod.shelf_life_months) || 12,
        barcode: prod.barcode,
        carton_barcode: prod.carton_barcode,
        customer: prod.customer || 'GENERAL',
        status: 'Active',
      });
      toast.success(`Product "${prod.product_name}" added!`);
      setProd({ ...prod, product_code: '', product_name: '', barcode: '', carton_barcode: '' });
      loadLookups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add product.');
    }
  };

  const saveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec.recipe_name.trim()) return toast.error('Recipe name is required.');
    const { error } = await supabase.from('recipes').insert({
      recipe_name: rec.recipe_name.trim(),
      brand: rec.brand,
      batch_prefix: rec.batch_prefix,
      cooking_time_hr: Number(rec.cooking_time_hr) || 0,
      batch_output_kg: Number(rec.batch_output_kg) || 0,
      shelf_life_months: Number(rec.shelf_life_months) || 12,
      version: 1,
      status: 'Active',
      deleted: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`Recipe "${rec.recipe_name}" added!`);
    setRec({ recipe_name: '', brand: '', batch_prefix: '', cooking_time_hr: '2', batch_output_kg: '500', shelf_life_months: '12' });
    loadLookups();
  };

  const saveForecastAndStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = products.find((x) => x.id === forecast.product_id);
    if (!p) return toast.error('Select a product.');

    const forecastQty = Number(forecast.forecast_quantity) || 0;
    const reorderLvl = Number(forecast.reorder_level) || 0;
    const bufferPct = Number(forecast.buffer_percentage) || 1.1;
    const stockCartons = Number(forecast.available_stock_cartons) || 0;

    const target = Math.round(forecastQty * bufferPct);
    const { error: planErr } = await supabase.from('sales_planning').insert({
      product_id: p.id,
      product_code: p.product_code,
      forecast_quantity: forecastQty,
      reorder_level: reorderLvl,
      buffer_percentage: bufferPct,
      target_stock: target,
      monthly_sales: forecastQty,
      average_daily_sales: Number((forecastQty / 30).toFixed(2)),
    });
    if (planErr) return toast.error(planErr.message);

    const pcs = Math.round(stockCartons * (Number(p.carton_size) || 1));
    const { error: invErr } = await supabase.from('finished_goods_inventory').upsert(
      {
        product_id: p.id,
        product_code: p.product_code,
        available_stock_cartons: stockCartons,
        current_stock_pcs: pcs,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );
    if (invErr) return toast.error(invErr.message);

    toast.success(`Saved forecast & stock for ${p.product_code}`);
    loadLookups();
  };

  const savePackaging = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkg.name.trim()) return toast.error('Item name is required.');
    const { error } = await supabase.from('packaging_items').insert({
      item_code: pkg.item_code,
      description: pkg.name,
      category: pkg.category,
      unit: pkg.unit,
      quantity: Number(pkg.current_stock) || 0,
      min_level: Number(pkg.safety_stock) || 0,
      active: true,
      deleted: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`Packaging item "${pkg.name}" added!`);
    setPkg({ item_code: '', name: '', category: 'Packaging Raw Material', unit: 'pcs', current_stock: '', safety_stock: '50' });
    loadLookups();
  };

  const saveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machine.name.trim()) return toast.error('Machine name is required.');
    const { error } = await supabase.from('machines').insert({
      name: machine.name.trim(),
      location: machine.location || '',
      capacity_cph: Number(machine.capacity_cph) || 0,
      status: machine.status || 'Active',
      deleted: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`Machine "${machine.name}" added!`);
    setMachine({ name: '', location: '', capacity_cph: '100', status: 'Active' });
    loadLookups();
  };

  const requestDelete = async (type: DeleteTarget['type'], item: any) => {
    let warning = 'This will archive the item (soft-delete) so historical records stay intact.';
    let label = item.product_name || item.recipe_name || item.description || item.name || item.product_code || item.id;

    if (type === 'product') {
      label = `${item.product_code} — ${item.product_name}`;
      const [{ count: batchCount }, { count: orderCount }] = await Promise.all([
        supabase.from('batch_records').select('id', { count: 'exact', head: true }).eq('product_id', item.id),
        supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('product_id', item.id),
      ]);
      if ((batchCount || 0) > 0 || (orderCount || 0) > 0) {
        warning = `This product is linked to ${batchCount || 0} batch(es) and ${orderCount || 0} production order(s). It will be archived (soft-deleted) so existing history is preserved.`;
      }
    } else if (type === 'recipe') {
      const linked = products.filter((p) => p.recipe_id === item.id).length;
      if (linked > 0) {
        warning = `This recipe is currently linked to ${linked} active product(s). Archiving it will hide it from new selections without breaking existing products.`;
      }
    } else if (type === 'machine') {
      const linked = products.filter((p) => p.default_machine === item.name).length;
      if (linked > 0) {
        warning = `This machine is set as the default for ${linked} active product(s). Archiving it will hide it from new selections while preserving existing records.`;
      }
    } else if (type === 'forecast') {
      label = `Forecast for ${item.product_code || item.product_id} (${item.forecast_quantity} ctns)`;
      warning = 'This will remove this sales forecast entry from planning.';
    }

    setDeleteTarget({ type, id: item.id, label, warning, item });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      let error = null;
      if (deleteTarget.type === 'product') {
        await archiveProductSafely(deleteTarget.item || { id: deleteTarget.id, product_code: deleteTarget.label }, 'Admin');
      } else if (deleteTarget.type === 'recipe') {
        await archiveRecipeSafely(deleteTarget.id);
      } else if (deleteTarget.type === 'packaging') {
        ({ error } = await supabase
          .from('packaging_items')
          .update({ deleted: true, active: false, updated_at: new Date().toISOString() })
          .eq('id', deleteTarget.id));
      } else if (deleteTarget.type === 'machine') {
        await archiveMachineSafely(deleteTarget.id, deleteTarget.item?.name);
      } else if (deleteTarget.type === 'forecast') {
        ({ error } = await supabase.from('sales_planning').delete().eq('id', deleteTarget.id));
      }

      if (error) throw new Error(error.message);
      toast.success(`Removed "${deleteTarget.label}".`);
      setDeleteTarget(null);
      await loadLookups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 sm:p-6 w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-sky-400" />
            Insert New Data
          </h1>
          <p className="text-sm text-slate-500">
            Add or safely archive Products, Recipes, Sales Forecasts & Stock, Packaging Materials, or Machines directly.
          </p>
        </div>
        <Link to="/sheet-migration">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-1.5" /> Bulk Spreadsheet Import
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="product">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="product"><Package className="w-4 h-4 mr-1" /> Product / SKU</TabsTrigger>
          <TabsTrigger value="recipe"><BookOpen className="w-4 h-4 mr-1" /> Recipe</TabsTrigger>
          <TabsTrigger value="forecast"><TrendingUp className="w-4 h-4 mr-1" /> Forecast & Stock</TabsTrigger>
          <TabsTrigger value="packaging"><Boxes className="w-4 h-4 mr-1" /> Packaging Material</TabsTrigger>
          <TabsTrigger value="machine"><Cpu className="w-4 h-4 mr-1" /> Machine / Tank</TabsTrigger>
        </TabsList>

        <TabsContent value="product" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add New Product / SKU</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveProduct} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500">Item Code *</label>
                  <Input value={prod.product_code} onChange={(e) => setProd({ ...prod, product_code: e.target.value })} placeholder="e.g. RSPT350GX12" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Product / Carton Description *</label>
                  <Input value={prod.product_name} onChange={(e) => setProd({ ...prod, product_name: e.target.value })} placeholder="e.g. RASTO TRADITIONAL PASTA SAUCE 350G X 12" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Brand</label>
                  <SearchableSelect
                    value={prod.brand}
                    onValueChange={(v) => setProd({ ...prod, brand: v })}
                    options={opts.brands}
                    placeholder="Select brand..."
                    searchPlaceholder="Search brand..."
                    allowCustom
                    clearable
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Recipe</label>
                  <SearchableSelect
                    value={prod.recipe_id}
                    onValueChange={(v) => setProd({ ...prod, recipe_id: v })}
                    options={recipes.map((r) => ({ value: r.id, label: r.recipe_name }))}
                    placeholder="Select Recipe..."
                    searchPlaceholder="Search recipe..."
                    clearable
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Machine (Tank)</label>
                  <SearchableSelect
                    value={prod.default_machine}
                    onValueChange={(v) => setProd({ ...prod, default_machine: v })}
                    options={[...new Set([...machines.map((m) => m.name), ...opts.lineOptions.map((l) => l.value)])]}
                    placeholder="Select Machine..."
                    searchPlaceholder="Search machine..."
                    allowCustom
                    clearable
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Pcs / Carton</label>
                  <Input type="number" min="0" value={prod.carton_size} onChange={(e) => setProd({ ...prod, carton_size: e.target.value })} placeholder="e.g. 24" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Net Weight / Pc (kg)</label>
                  <Input type="number" min="0" step="0.001" value={prod.net_weight_kg} onChange={(e) => setProd({ ...prod, net_weight_kg: e.target.value })} placeholder="e.g. 0.2" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Prefix</label>
                  <Input value={prod.batch_prefix} onChange={(e) => setProd({ ...prod, batch_prefix: e.target.value })} placeholder="e.g. RTP" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cooking Time (hr)</label>
                  <Input type="number" min="0" step="0.25" value={prod.cooking_time_hr} onChange={(e) => setProd({ ...prod, cooking_time_hr: e.target.value })} placeholder="e.g. 2" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Output (kg)</label>
                  <Input type="number" min="0" value={prod.batch_output_kg} onChange={(e) => setProd({ ...prod, batch_output_kg: e.target.value })} placeholder="e.g. 500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Shelf Life (Months)</label>
                  <Input type="number" min="0" value={prod.shelf_life_months} onChange={(e) => setProd({ ...prod, shelf_life_months: e.target.value })} placeholder="e.g. 12" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">SKU Barcode</label>
                  <Input value={prod.barcode} onChange={(e) => setProd({ ...prod, barcode: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Carton Barcode (EAN-13)</label>
                  <Input value={prod.carton_barcode} onChange={(e) => setProd({ ...prod, carton_barcode: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Customer</label>
                  <SearchableSelect
                    value={prod.customer}
                    onValueChange={(v) => setProd({ ...prod, customer: v })}
                    options={opts.channels}
                    placeholder="Select customer..."
                    searchPlaceholder="Search customer..."
                    allowCustom
                  />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Product to Supabase</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-slate-700">Existing Products ({products.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {products.length === 0 ? (
                <p className="text-xs text-slate-400">No active products.</p>
              ) : (
                products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-indigo-700 mr-2">{p.product_code}</span>
                      <span className="text-slate-800 truncate">{p.product_name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0" onClick={() => requestDelete('product', p)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipe" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add New Recipe</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveRecipe} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Recipe Name *</label>
                  <SearchableSelect
                    value={rec.recipe_name}
                    onValueChange={(v) => setRec({ ...rec, recipe_name: v })}
                    options={[...new Set(recipes.map((r) => r.recipe_name).filter(Boolean))]}
                    placeholder="Select or enter recipe..."
                    searchPlaceholder="Search recipe..."
                    allowCustom
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Brand</label>
                  <SearchableSelect
                    value={rec.brand}
                    onValueChange={(v) => setRec({ ...rec, brand: v })}
                    options={opts.brands}
                    placeholder="Select brand..."
                    searchPlaceholder="Search brand..."
                    allowCustom
                    clearable
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Prefix</label>
                  <Input value={rec.batch_prefix} onChange={(e) => setRec({ ...rec, batch_prefix: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cooking Time (hr)</label>
                  <Input type="number" min="0" step="0.25" value={rec.cooking_time_hr} onChange={(e) => setRec({ ...rec, cooking_time_hr: e.target.value })} placeholder="e.g. 2" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Output (kg)</label>
                  <Input type="number" min="0" value={rec.batch_output_kg} onChange={(e) => setRec({ ...rec, batch_output_kg: e.target.value })} placeholder="e.g. 500" />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Recipe</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-slate-700">Existing Recipes ({recipes.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {recipes.length === 0 ? (
                <p className="text-xs text-slate-400">No active recipes.</p>
              ) : (
                recipes.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{r.recipe_name}</span>
                      {r.brand && <span className="text-xs text-slate-400 ml-2">({r.brand})</span>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0" onClick={() => requestDelete('recipe', r)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Set Sales Forecast, Reorder Level & Initial Stock</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveForecastAndStock} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Product *</label>
                  <SearchableSelect
                    value={forecast.product_id}
                    onValueChange={(v) => setForecast({ ...forecast, product_id: v })}
                    options={products.map((p) => ({ value: p.id, label: `${p.product_code} — ${p.product_name}` }))}
                    placeholder="Select Product..."
                    searchPlaceholder="Search product code or name..."
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Monthly Forecast (Cartons)</label>
                  <Input type="number" min="0" value={forecast.forecast_quantity} onChange={(e) => setForecast({ ...forecast, forecast_quantity: e.target.value })} placeholder="e.g. 100" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Reorder Level (Cartons)</label>
                  <Input type="number" min="0" value={forecast.reorder_level} onChange={(e) => setForecast({ ...forecast, reorder_level: e.target.value })} placeholder="e.g. 50" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Buffer Multiplier (e.g. 1.1)</label>
                  <Input type="number" min="0" step="0.05" value={forecast.buffer_percentage} onChange={(e) => setForecast({ ...forecast, buffer_percentage: e.target.value })} placeholder="1.1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Current Finished Stock (Cartons)</label>
                  <Input type="number" min="0" value={forecast.available_stock_cartons} onChange={(e) => setForecast({ ...forecast, available_stock_cartons: e.target.value })} placeholder="0" />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">Save Forecast & Stock</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-slate-700">Recent Forecast Entries ({forecasts.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {forecasts.length === 0 ? (
                <p className="text-xs text-slate-400">No forecast entries yet.</p>
              ) : (
                forecasts.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-indigo-700 mr-2">{f.product_code || f.product_id}</span>
                      <span className="text-slate-600 text-xs">Forecast: {f.forecast_quantity} ctns · Reorder: {f.reorder_level}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0" onClick={() => requestDelete('forecast', f)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packaging" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Packaging / Raw Material Item</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={savePackaging} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500">Item Code</label>
                  <Input value={pkg.item_code} onChange={(e) => setPkg({ ...pkg, item_code: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Item Name *</label>
                  <Input value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Category</label>
                  <SearchableSelect
                    value={pkg.category}
                    onValueChange={(v) => setPkg({ ...pkg, category: v })}
                    options={opts.categories}
                    placeholder="Select category..."
                    searchPlaceholder="Search category..."
                    allowCustom
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Unit</label>
                  <SearchableSelect
                    value={pkg.unit}
                    onValueChange={(v) => setPkg({ ...pkg, unit: v })}
                    options={opts.units}
                    placeholder="Select unit..."
                    searchPlaceholder="Search unit..."
                    allowCustom
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Current Stock</label>
                  <Input type="number" min="0" value={pkg.current_stock} onChange={(e) => setPkg({ ...pkg, current_stock: e.target.value })} placeholder="0" />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Packaging Item</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-slate-700">Existing Packaging Items ({packagingItems.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {packagingItems.length === 0 ? (
                <p className="text-xs text-slate-400">No active packaging items.</p>
              ) : (
                packagingItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                    <div className="min-w-0">
                      {item.item_code && <span className="font-mono text-xs font-semibold text-indigo-700 mr-2">{item.item_code}</span>}
                      <span className="text-slate-800">{item.description || item.name}</span>
                      <span className="text-xs text-slate-400 ml-2">({item.quantity ?? 0} {item.unit})</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0" onClick={() => requestDelete('packaging', item)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="machine" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Machine / Cooking Tank</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveMachine} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500">Machine / Tank Name *</label>
                  <SearchableSelect
                    value={machine.name}
                    onValueChange={(v) => setMachine({ ...machine, name: v })}
                    options={opts.lineOptions}
                    placeholder="Select or enter machine..."
                    searchPlaceholder="Search machine..."
                    allowCustom
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Location</label>
                  <SearchableSelect
                    value={machine.location}
                    onValueChange={(v) => setMachine({ ...machine, location: v })}
                    options={opts.locations.length ? opts.locations : ['Plant 1', 'Plant 2']}
                    placeholder="Select location..."
                    searchPlaceholder="Search location..."
                    allowCustom
                    clearable
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Capacity (CPH)</label>
                  <Input type="number" min="0" value={machine.capacity_cph} onChange={(e) => setMachine({ ...machine, capacity_cph: e.target.value })} placeholder="e.g. 100" />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Machine</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-slate-700">Existing Machines ({machines.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {machines.length === 0 ? (
                <p className="text-xs text-slate-400">No active machines.</p>
              ) : (
                machines.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{m.name}</span>
                      {m.location && <span className="text-xs text-slate-400 ml-2">· {m.location}</span>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0" onClick={() => requestDelete('machine', m)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              Confirm Delete
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-900">{deleteTarget.label}</p>
              <p>{deleteTarget.warning}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
