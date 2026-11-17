import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { QuantityCalculator } from './QuantityCalculator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ClipboardCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function StockCheckPanel({
  items,
  onUpdated,
}: {
  items: any[];
  onUpdated: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [countedQty, setCountedQty] = useState(0);
  const [saving, setSaving] = useState(false);

  const selected = items.find((i) => i.id === selectedId);
  const systemQty = Number(selected?.current_stock || 0);
  const delta = countedQty - systemQty;

  const handleApplyCount = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('packaging_items')
        .update({ current_stock: countedQty, updated_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (error) throw error;

      await supabase.from('packaging_movements').insert({
        item_id: selected.id,
        item_code: selected.item_code || '',
        item_name: selected.name,
        category: selected.category || 'General',
        type: 'adjustment',
        quantity: Math.abs(delta),
        unit: selected.unit || 'pcs',
        before_stock: systemQty,
        after_stock: countedQty,
        reason: `Physical Stock Check (${delta >= 0 ? `+${delta}` : delta})`,
        movement_date: new Date().toISOString().slice(0, 10),
      });

      toast.success(`Adjusted ${selected.name} to ${countedQty} (${delta >= 0 ? `+${delta}` : delta})`);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-indigo-600" />
          Physical Stock Check & Audit Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select item to audit...</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} (System: {i.current_stock ?? 0} {i.unit || 'pcs'})
            </option>
          ))}
        </select>

        {selected && (
          <>
            <QuantityCalculator onChange={setCountedQty} />
            <div className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border">
              <span>System: <strong>{systemQty}</strong> · Counted: <strong>{countedQty}</strong></span>
              <Badge variant="outline" className={delta === 0 ? 'text-emerald-600' : 'text-amber-700'}>
                {delta === 0 ? (
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Exact Match</span>
                ) : (
                  <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Delta: {delta > 0 ? `+${delta}` : delta}</span>
                )}
              </Badge>
            </div>
            <Button size="sm" className="w-full" onClick={handleApplyCount} disabled={saving}>
              Apply Verified Count to Stock
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
