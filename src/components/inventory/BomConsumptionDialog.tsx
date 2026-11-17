import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Layers, CheckCircle2, AlertCircle } from 'lucide-react';

export function BomConsumptionPanel({
  recipes,
  stockItems,
  onConsumed,
}: {
  recipes: any[];
  stockItems: any[];
  onConsumed: () => void;
}) {
  const [recipeId, setRecipeId] = useState('');
  const [batches, setBatches] = useState(1);
  const [applying, setApplying] = useState(false);

  const selectedRecipe = recipes.find((r) => r.id === recipeId);
  const ingredients: Array<{ item_name: string; quantity: number; unit?: string }> = Array.isArray(
    selectedRecipe?.ingredients
  )
    ? selectedRecipe.ingredients
    : [];

  const stockByName = new Map(
    stockItems.map((s) => [String(s.name || '').toLowerCase().trim(), s])
  );

  const applyConsumption = async () => {
    if (!selectedRecipe || ingredients.length === 0) return;
    setApplying(true);
    try {
      for (const ing of ingredients) {
        const stock = stockByName.get(String(ing.item_name || '').toLowerCase().trim());
        if (!stock) continue;
        const needed = Number(ing.quantity || 0) * batches;
        const before = Number(stock.current_stock || 0);
        const after = Math.max(0, before - needed);

        await supabase.from('packaging_items').update({ current_stock: after }).eq('id', stock.id);
        await supabase.from('packaging_movements').insert({
          item_id: stock.id,
          item_code: stock.item_code || '',
          item_name: stock.name,
          type: 'usage',
          quantity: needed,
          unit: ing.unit || stock.unit || 'pcs',
          before_stock: before,
          after_stock: after,
          reason: `Recipe BOM: ${selectedRecipe.recipe_name} (${batches}x)`,
          movement_date: new Date().toISOString().slice(0, 10),
        });
      }
      toast.success(`Deducted BOM consumption for ${selectedRecipe.recipe_name}`);
      onConsumed();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          Recipe BOM Consumption Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <select
            className="col-span-2 border rounded-md px-3 py-2 text-sm"
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
          >
            <option value="">Select Recipe BOM...</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.recipe_name}</option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            value={batches}
            onChange={(e) => setBatches(Math.max(1, Number(e.target.value) || 1))}
            placeholder="Batches"
          />
        </div>

        {selectedRecipe && ingredients.length > 0 && (
          <div className="space-y-1.5 text-xs">
            {ingredients.map((ing, i) => {
              const stock = stockByName.get(String(ing.item_name || '').toLowerCase().trim());
              const needed = Number(ing.quantity || 0) * batches;
              const avail = Number(stock?.current_stock || 0);
              const short = needed - avail;
              return (
                <div key={i} className="flex items-center justify-between p-2 rounded border bg-slate-50">
                  <span>{ing.item_name} (Need: {needed} {ing.unit || 'pcs'})</span>
                  {!stock ? (
                    <Badge variant="outline" className="text-amber-700">Not in stock list</Badge>
                  ) : short > 0 ? (
                    <Badge variant="outline" className="text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Short by {short}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> OK ({avail})
                    </Badge>
                  )}
                </div>
              );
            })}
            <Button size="sm" className="w-full mt-2" onClick={applyConsumption} disabled={applying}>
              Apply Consumption to Stock
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
