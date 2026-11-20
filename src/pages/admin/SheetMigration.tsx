import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { parseSpreadsheetFile, downloadTemplateXlsx } from '@/lib/excelUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, Download, CheckCircle2 } from 'lucide-react';

type ImportTarget = 'forecasts' | 'warehouse_stock' | 'packaging';

export default function SheetMigration({ embedded = false }: { embedded?: boolean }) {
  const [target, setTarget] = useState<ImportTarget>('forecasts');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file);
      setRows(parsed.rows);
      setFileName(file.name);
      setResultMsg('');
      toast.success(`Parsed ${parsed.rows.length} rows from ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse spreadsheet');
    }
  };

  const handleImport = async () => {
    if (!rows.length) return toast.error('Upload a spreadsheet first.');
    setImporting(true);
    try {
      if (target === 'forecasts') {
        const [{ data: prods }, { data: existingForecasts }] = await Promise.all([
          supabase.from('products').select('id, product_code, product_name'),
          supabase.from('sales_planning').select('id, product_id, product_code').eq('deleted', false),
        ]);
        const byCode = new Map((prods || []).map((p: any) => [String(p.product_code || '').toUpperCase(), p]));
        const existingByProdId = new Map(
          (existingForecasts || []).filter((f: any) => f.product_id).map((f: any) => [f.product_id, f.id])
        );
        const existingByCode = new Map(
          (existingForecasts || []).filter((f: any) => f.product_code).map((f: any) => [String(f.product_code).toUpperCase(), f.id])
        );
        let created = 0;
        let updated = 0;
        for (const r of rows) {
          const code = String(r.ItemCode || r.product_code || '').trim();
          if (!code) continue;
          const prod: any = byCode.get(code.toUpperCase());
          const forecast = Number(r.Forecast || r.forecast_quantity || 0);
          const buffer = Number(r.Buffer || r.buffer_percentage || 1.1) || 1.1;
          const payload = {
            product_id: prod?.id || null,
            product_code: code,
            forecast_quantity: forecast,
            reorder_level: Number(r.REORDERLEVEL || r.reorder_level || 0),
            buffer_percentage: buffer,
            target_stock: Math.round(forecast * buffer),
            monthly_sales: forecast,
            average_daily_sales: Number((forecast / 30).toFixed(2)),
            updated_at: new Date().toISOString(),
          };
          const existingId = (prod?.id && existingByProdId.get(prod.id)) || existingByCode.get(code.toUpperCase());
          if (existingId) {
            const { error } = await supabase.from('sales_planning').update(payload).eq('id', existingId);
            if (error) throw error;
            updated++;
          } else {
            const { error } = await supabase.from('sales_planning').insert(payload);
            if (error) throw error;
            created++;
          }
        }
        setResultMsg(`Synced forecasts into sales_planning: ${created} created, ${updated} updated.`);
      } else if (target === 'warehouse_stock') {
        const { data: prods } = await supabase.from('products').select('id, product_code, carton_size');
        const byCode = new Map((prods || []).map((p: any) => [String(p.product_code || '').toUpperCase(), p]));
        let count = 0;
        for (const r of rows) {
          const code = String(r.ItemCode || r.product_code || '').trim();
          const qtyCartons = Number(r.Qty || r.available_stock_cartons || 0);
          const prod: any = byCode.get(code.toUpperCase());
          if (!prod) continue;
          const pcs = Math.round(qtyCartons * (Number(prod.carton_size) || 1));
          await supabase.from('finished_goods_inventory').upsert(
            {
              product_id: prod.id,
              product_code: code,
              available_stock_cartons: qtyCartons,
              current_stock_pcs: pcs,
              last_updated: new Date().toISOString(),
            },
            { onConflict: 'product_id' }
          );
          count++;
        }
        setResultMsg(`Synced ${count} product inventory rows into finished_goods_inventory.`);
      } else if (target === 'packaging') {
        const { data: existingItems } = await supabase
          .from('packaging_items')
          .select('id, item_code')
          .eq('deleted', false);
        const existingByCode = new Map(
          (existingItems || []).filter((i: any) => i.item_code).map((i: any) => [String(i.item_code).trim().toUpperCase(), i.id])
        );
        const filtered = rows.filter((r) => r.description || r.name || r.item_code);
        let created = 0;
        let updated = 0;
        for (const r of filtered) {
          const itemCode = String(r.item_code || '').trim();
          const payload = {
            item_code: itemCode,
            description: String(r.description || r.name || itemCode).trim(),
            category: String(r.category || 'Packaging Raw Material').trim(),
            unit: String(r.unit || 'pcs').trim(),
            quantity: Number(r.quantity ?? r.current_stock ?? 0),
            min_level: Number(r.min_level ?? r.safety_stock ?? 50),
            active: true,
            deleted: false,
            updated_at: new Date().toISOString(),
          };
          const existingId = itemCode ? existingByCode.get(itemCode.toUpperCase()) : undefined;
          if (existingId) {
            const { error } = await supabase.from('packaging_items').update(payload).eq('id', existingId);
            if (error) throw error;
            updated++;
          } else {
            const { data: ins, error } = await supabase.from('packaging_items').insert(payload).select('id').single();
            if (error) throw error;
            if (itemCode && ins?.id) existingByCode.set(itemCode.toUpperCase(), ins.id);
            created++;
          }
        }
        setResultMsg(`Synced packaging/raw material items: ${created} created, ${updated} updated.`);
      }
      toast.success('Spreadsheet data synced to Supabase!');
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "min-h-screen bg-[#F6F8FC] p-4 sm:p-6 w-full space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Excel / Google Sheet Migration Center
          </h1>
          <p className="text-sm text-slate-500">
            Upload .xlsx or .csv sheets to upsert forecasts or opening stock balances safely without duplicates.
          </p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">1. Select Target Table &amp; Download Template</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(
            [
              ['forecasts', 'Sales Forecasts & Reorder'],
              ['warehouse_stock', 'Finished Goods Stock'],
              ['packaging', 'Packaging & Raw Materials'],
            ] as Array<[ImportTarget, string]>
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={target === key ? 'default' : 'outline'}
              onClick={() => setTarget(key)}
            >
              {label}
            </Button>
          ))}
          <Button variant="ghost" className="ml-auto" onClick={() => downloadTemplateXlsx(target)}>
            <Download className="w-4 h-4 mr-1" /> Download Template (.xlsx)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Upload Spreadsheet (.xlsx / .csv)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="text-sm" />
            {fileName && <Badge variant="secondary">{fileName} · {rows.length} rows</Badge>}
            <Button className="ml-auto" onClick={handleImport} disabled={importing || rows.length === 0}>
              <Upload className="w-4 h-4 mr-1" /> {importing ? 'Importing...' : 'Transfer to Supabase'}
            </Button>
          </div>
          {resultMsg && (
            <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {resultMsg}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
