import React, { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { PlusCircle, Package, BookOpen, TrendingUp, Boxes, Cpu } from 'lucide-react';

export default function InsertData() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [prod, setProd] = useState({
    product_code: '',
    product_name: '',
    brand: '',
    recipe_id: '',
    default_machine: '',
    carton_size: 24,
    net_weight_kg: 0.2,
    cooking_time_hr: 2,
    batch_output_kg: 500,
    batch_prefix: '',
    shelf_life_months: 12,
    barcode: '',
    carton_barcode: '',
    customer: 'GENERAL',
  });

  const [rec, setRec] = useState({
    recipe_name: '',
    brand: '',
    batch_prefix: '',
    cooking_time_hr: 2,
    batch_output_kg: 500,
    shelf_life_months: 12,
  });

  const [forecast, setForecast] = useState({
    product_id: '',
    forecast_quantity: 100,
    reorder_level: 50,
    buffer_percentage: 1.1,
    available_stock_cartons: 0,
  });

  const [pkg, setPkg] = useState({
    item_code: '',
    name: '',
    category: 'Packaging Raw Material',
    unit: 'pcs',
    current_stock: 0,
    safety_stock: 50,
  });

  const [machine, setMachine] = useState({
    name: '',
    location: '',
    capacity_cph: 100,
    status: 'Active',
  });

  const loadLookups = async () => {
    const [r, m, p] = await Promise.all([
      supabase.from('recipes').select('*').eq('deleted', false).order('recipe_name'),
      supabase.from('machines').select('*').eq('deleted', false).order('name'),
      supabase.from('products').select('*').eq('deleted', false).order('product_name'),
    ]);
    setRecipes(r.data || []);
    setMachines(m.data || []);
    setProducts(p.data || []);
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
    const netFilling = Number((prod.carton_size * prod.net_weight_kg).toFixed(3));
    const cartonsPerBatch = netFilling > 0 ? Number((prod.batch_output_kg / netFilling).toFixed(1)) : 0;

    const { error } = await supabase.from('products').insert({
      ...prod,
      recipe_id: prod.recipe_id || null,
      recipe_name: selectedRec?.recipe_name || '',
      net_filling_kg: netFilling,
      cartons_per_batch: cartonsPerBatch,
      cooking_time_min: Math.round(prod.cooking_time_hr * 60),
      target_net_weight_g: Math.round(prod.net_weight_kg * 1000),
      shelf_life_days: prod.shelf_life_months * 30,
      status: 'Active',
      active: true,
      deleted: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`Product "${prod.product_name}" added!`);
    setProd({ ...prod, product_code: '', product_name: '', barcode: '', carton_barcode: '' });
    loadLookups();
  };

  const saveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec.recipe_name.trim()) return toast.error('Recipe name is required.');
    const { error } = await supabase.from('recipes').insert({
      ...rec,
      version: 1,
      status: 'Active',
      deleted: false,
    });
    if (error) return toast.error(error.message);
    toast.success(`Recipe "${rec.recipe_name}" added!`);
    setRec({ recipe_name: '', brand: '', batch_prefix: '', cooking_time_hr: 2, batch_output_kg: 500, shelf_life_months: 12 });
    loadLookups();
  };

  const saveForecastAndStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = products.find((x) => x.id === forecast.product_id);
    if (!p) return toast.error('Select a product.');

    const target = Math.round(forecast.forecast_quantity * forecast.buffer_percentage);
    const { error: planErr } = await supabase.from('sales_planning').insert({
      product_id: p.id,
      product_code: p.product_code,
      forecast_quantity: forecast.forecast_quantity,
      reorder_level: forecast.reorder_level,
      buffer_percentage: forecast.buffer_percentage,
      target_stock: target,
      monthly_sales: forecast.forecast_quantity,
      average_daily_sales: Number((forecast.forecast_quantity / 30).toFixed(2)),
    });
    if (planErr) return toast.error(planErr.message);

    const pcs = Math.round(forecast.available_stock_cartons * (Number(p.carton_size) || 1));
    const { error: invErr } = await supabase.from('finished_goods_inventory').upsert(
      {
        product_id: p.id,
        product_code: p.product_code,
        available_stock_cartons: forecast.available_stock_cartons,
        current_stock_pcs: pcs,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );
    if (invErr) return toast.error(invErr.message);

    toast.success(`Saved forecast & stock for ${p.product_code}`);
  };

  const savePackaging = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkg.name.trim()) return toast.error('Item name is required.');
    const { error } = await supabase.from('packaging_items').insert({ ...pkg, active: true, deleted: false });
    if (error) return toast.error(error.message);
    toast.success(`Packaging item "${pkg.name}" added!`);
    setPkg({ item_code: '', name: '', category: 'Packaging Raw Material', unit: 'pcs', current_stock: 0, safety_stock: 50 });
  };

  const saveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machine.name.trim()) return toast.error('Machine name is required.');
    const { error } = await supabase.from('machines').insert({ ...machine, deleted: false });
    if (error) return toast.error(error.message);
    toast.success(`Machine "${machine.name}" added!`);
    setMachine({ name: '', location: '', capacity_cph: 100, status: 'Active' });
    loadLookups();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <PlusCircle className="w-6 h-6 text-indigo-600" />
          Insert New Data
        </h1>
        <p className="text-sm text-slate-500">
          Quickly add new Products, Recipes, Sales Forecasts & Stock, Packaging Materials, or Machines directly into Supabase.
        </p>
      </div>

      <Tabs defaultValue="product">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="product"><Package className="w-4 h-4 mr-1" /> Product / SKU</TabsTrigger>
          <TabsTrigger value="recipe"><BookOpen className="w-4 h-4 mr-1" /> Recipe</TabsTrigger>
          <TabsTrigger value="forecast"><TrendingUp className="w-4 h-4 mr-1" /> Forecast & Stock</TabsTrigger>
          <TabsTrigger value="packaging"><Boxes className="w-4 h-4 mr-1" /> Packaging Material</TabsTrigger>
          <TabsTrigger value="machine"><Cpu className="w-4 h-4 mr-1" /> Machine / Tank</TabsTrigger>
        </TabsList>

        <TabsContent value="product" className="mt-4">
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
                  <Input value={prod.brand} onChange={(e) => setProd({ ...prod, brand: e.target.value })} placeholder="e.g. RASTO" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Recipe</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={prod.recipe_id} onChange={(e) => setProd({ ...prod, recipe_id: e.target.value })}>
                    <option value="">Select Recipe...</option>
                    {recipes.map((r) => <option key={r.id} value={r.id}>{r.recipe_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Machine (Tank)</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={prod.default_machine} onChange={(e) => setProd({ ...prod, default_machine: e.target.value })}>
                    <option value="">Select Machine...</option>
                    {machines.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Pcs / Carton</label>
                  <Input type="number" value={prod.carton_size} onChange={(e) => setProd({ ...prod, carton_size: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Net Weight / Pc (kg)</label>
                  <Input type="number" step="0.001" value={prod.net_weight_kg} onChange={(e) => setProd({ ...prod, net_weight_kg: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Prefix</label>
                  <Input value={prod.batch_prefix} onChange={(e) => setProd({ ...prod, batch_prefix: e.target.value })} placeholder="e.g. RTP" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cooking Time (hr)</label>
                  <Input type="number" step="0.25" value={prod.cooking_time_hr} onChange={(e) => setProd({ ...prod, cooking_time_hr: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Output (kg)</label>
                  <Input type="number" value={prod.batch_output_kg} onChange={(e) => setProd({ ...prod, batch_output_kg: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Shelf Life (Months)</label>
                  <Input type="number" value={prod.shelf_life_months} onChange={(e) => setProd({ ...prod, shelf_life_months: Number(e.target.value) })} />
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
                  <Input value={prod.customer} onChange={(e) => setProd({ ...prod, customer: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Product to Supabase</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipe" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add New Recipe</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveRecipe} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Recipe Name *</label>
                  <Input value={rec.recipe_name} onChange={(e) => setRec({ ...rec, recipe_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Brand</label>
                  <Input value={rec.brand} onChange={(e) => setRec({ ...rec, brand: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Prefix</label>
                  <Input value={rec.batch_prefix} onChange={(e) => setRec({ ...rec, batch_prefix: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Cooking Time (hr)</label>
                  <Input type="number" step="0.25" value={rec.cooking_time_hr} onChange={(e) => setRec({ ...rec, cooking_time_hr: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Batch Output (kg)</label>
                  <Input type="number" value={rec.batch_output_kg} onChange={(e) => setRec({ ...rec, batch_output_kg: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Recipe</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Set Sales Forecast, Reorder Level & Initial Stock</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveForecastAndStock} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Product *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={forecast.product_id} onChange={(e) => setForecast({ ...forecast, product_id: e.target.value })}>
                    <option value="">Select Product...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.product_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Monthly Forecast (Cartons)</label>
                  <Input type="number" value={forecast.forecast_quantity} onChange={(e) => setForecast({ ...forecast, forecast_quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Reorder Level (Cartons)</label>
                  <Input type="number" value={forecast.reorder_level} onChange={(e) => setForecast({ ...forecast, reorder_level: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Buffer Multiplier (e.g. 1.1)</label>
                  <Input type="number" step="0.05" value={forecast.buffer_percentage} onChange={(e) => setForecast({ ...forecast, buffer_percentage: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Current Finished Stock (Cartons)</label>
                  <Input type="number" value={forecast.available_stock_cartons} onChange={(e) => setForecast({ ...forecast, available_stock_cartons: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">Save Forecast & Stock</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packaging" className="mt-4">
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
                  <Input value={pkg.category} onChange={(e) => setPkg({ ...pkg, category: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Unit</label>
                  <Input value={pkg.unit} onChange={(e) => setPkg({ ...pkg, unit: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Current Stock</label>
                  <Input type="number" value={pkg.current_stock} onChange={(e) => setPkg({ ...pkg, current_stock: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Packaging Item</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="machine" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Machine / Cooking Tank</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveMachine} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500">Machine / Tank Name *</label>
                  <Input value={machine.name} onChange={(e) => setMachine({ ...machine, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Location</label>
                  <Input value={machine.location} onChange={(e) => setMachine({ ...machine, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Capacity (CPH)</label>
                  <Input type="number" value={machine.capacity_cph} onChange={(e) => setMachine({ ...machine, capacity_cph: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Save Machine</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
