import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { parseSpreadsheetFile, downloadTemplateXlsx } from '@/lib/excelUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, Download, CheckCircle2 } from 'lucide-react';

type ImportTarget = 'products' | 'forecasts' | 'warehouse_stock' | 'packaging';

export default function SheetMigration() {
  const [target, setTarget] = useState<ImportTarget>('products');
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
      if (target === 'products') {
        const mapped = rows
          .filter((r) => r.product_code || r.ItemCode || r.product_name || r.DESCRIPTION)
          .map((r) => ({
            product_code: String(r.product_code || r.ItemCode || '').trim(),
            product_name: String(r.product_name || r.DESCRIPTION || r.ItemCode || '').trim(),
            brand: String(r.brand || ''),
            carton_size: Number(r.pcs_per_carton || r.carton_size || 1),
            net_weight_kg: Number(r.net_weight_kg || 0.1),
            batch_prefix: String(r.batch_prefix || ''),
            shelf_life_months: Number(r.shelf_life_months || 12),
            carton_barcode: String(r.carton_barcode || ''),
            cooking_time_hr: Number(r.cooking_time_hr || 2),
            batch_output_kg: Number(r.batch_output_kg || 200),
            active: true,
            deleted: false,
          }));
        const { error } = await supabase.from('products').insert(mapped);
        if (error) throw error;
        setResultMsg(`Imported ${mapped.length} products into Supabase.`);
      } else if (target === 'forecasts') {
        const { data: prods } = await supabase.from('products').select('id, product_code, product_name');
        const byCode = new Map((prods || []).map((p: any) => [String(p.product_code || '').toUpperCase(), p]));
        const mapped = rows.map((r) => {
          const code = String(r.ItemCode || r.product_code || '').trim();
          const prod: any = byCode.get(code.toUpperCase());
          const forecast = Number(r.Forecast || r.forecast_quantity || 0);
          const buffer = Number(r.Buffer || r.buffer_percentage || 1.1) || 1.1;
          return {
            product_id: prod?.id || null,
            product_code: code,
            forecast_quantity: forecast,
            reorder_level: Number(r.REORDERLEVEL || r.reorder_level || 0),
            buffer_percentage: buffer,
            target_stock: Math.round(forecast * buffer),
            monthly_sales: forecast,
            average_daily_sales: Number((forecast / 30).toFixed(2)),
          };
        });
        const { error } = await supabase.from('sales_planning').insert(mapped);
        if (error) throw error;
        setResultMsg(`Imported ${mapped.length} forecast/reorder rows into sales_planning.`);
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
        const mapped = rows
          .filter((r) => r.name || r.item_code)
          .map((r) => ({
            item_code: String(r.item_code || ''),
            name: String(r.name || r.item_code),
            category: String(r.category || 'Packaging Raw Material'),
            unit: String(r.unit || 'pcs'),
            current_stock: Number(r.current_stock || 0),
            safety_stock: Number(r.safety_stock || 50),
            active: true,
          }));
        const { error } = await supabase.from('packaging_items').insert(mapped);
        if (error) throw error;
        setResultMsg(`Imported ${mapped.length} packaging/raw material items.`);
      }
      toast.success('Spreadsheet data transferred to Supabase!');
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 sm:p-6 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          Excel / Google Sheet Migration Center
        </h1>
        <p className="text-sm text-slate-500">
          Export your previous Google Sheets as .xlsx or .csv and upload them here to seed your Supabase database cleanly.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Select Target Table & Download Template</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(
            [
              ['products', 'Products / SKUs'],
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
