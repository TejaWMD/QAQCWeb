import React, { useState, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { playScanBeep } from '@/lib/scanFeedback';
import { matchParsedQrToProduct, parseQRPayload } from '@/lib/qrParser';
import { CameraQRScanner } from '@/components/warehouse/QRScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Package, History } from 'lucide-react';
import { fmtDay } from '@/lib/labels';

export default function BarcodeLookup() {
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const performLookup = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    setBarcode(clean);
    setLoading(true);
    try {
      const { data: allProds } = await supabase
        .from('products')
        .select('*')
        .neq('deleted', true);
      const prodList = allProds || [];

      let prod: any = null;
      if (clean.includes('|') || clean.startsWith('{')) {
        const parsed = parseQRPayload(clean);
        if (parsed.ok) {
          prod = matchParsedQrToProduct(parsed.data, prodList);
        }
      }

      if (!prod) {
        const norm = clean.replace(/^\*+/, '').toUpperCase();
        const noZero = norm.replace(/^0+/, '');
        prod = prodList.find((p) => {
          const b1 = String(p.carton_barcode || '').replace(/^\*+/, '').toUpperCase();
          const b2 = String(p.barcode || '').replace(/^\*+/, '').toUpperCase();
          const c = String(p.product_code || '').toUpperCase();
          const n = String(p.product_name || '').toUpperCase();
          return (
            b1 === norm ||
            b2 === norm ||
            (noZero && (b1.replace(/^0+/, '') === noZero || b2.replace(/^0+/, '') === noZero)) ||
            c === norm ||
            n === norm
          );
        });

        // Fallback: allow searching directly by batch number
        if (!prod) {
          const { data: batchHit } = await supabase
            .from('batch_records')
            .select('*')
            .ilike('batch_number', norm)
            .eq('deleted', false)
            .limit(1)
            .maybeSingle();
          if (batchHit) {
            prod =
              prodList.find((p) => p.id === batchHit.product_id || String(p.product_code || '').toUpperCase() === String(batchHit.product_code || '').toUpperCase()) ||
              {
                id: batchHit.product_id || batchHit.id,
                product_code: batchHit.product_code,
                product_name: batchHit.product_name,
                carton_barcode: batchHit.carton_barcode,
                carton_size: batchHit.pcs_per_carton,
              };
          }
        }
      }

      if (!prod) {
        playScanBeep(false);
        setProduct(null);
        setBatches([]);
        toast.error(`No product found for "${clean}"`);
        return;
      }

      playScanBeep(true);
      setProduct(prod);

      const { data: batchRows } = await supabase
        .from('batch_records')
        .select('*')
        .eq('product_id', prod.id)
        .eq('deleted', false)
        .order('production_date', { ascending: false })
        .limit(50);

      setBatches(batchRows || []);

      if (batchRows && batchRows.length > 0) {
        await supabase.from('batch_logs').insert({
          batch_id: batchRows[0].id,
          batch_number: batchRows[0].batch_number,
          product_name: prod.product_name,
          action: 'viewed',
          details: `Carton barcode lookup (${clean})`,
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  useHardwareScanner(performLookup, true);

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 w-full space-y-4">
      <div>
        <h2 className="text-[#0F294A] text-lg font-semibold">Carton Barcode &amp; QR Lookup</h2>
        <p className="text-[#64748B] text-sm mt-1">
          Scan a carton barcode, QR code, or SKU code to inspect product specs and batch history.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <CameraQRScanner
            onDecode={(decoded) => {
              setBarcode(decoded);
              performLookup(decoded);
            }}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              performLookup(barcode);
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              autoFocus
              placeholder="Scan or type carton barcode, QR payload, or SKU..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="font-mono text-base"
            />
            <Button type="submit" disabled={loading}>
              <Search className="w-4 h-4 mr-1" /> Lookup
            </Button>
          </form>
        </CardContent>
      </Card>

      {product && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                {product.product_name}
              </span>
              <Badge variant="outline" className="font-mono">{product.product_code}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-slate-500 block">Carton Barcode</span><span className="font-mono font-medium">{product.carton_barcode || '-'}</span></div>
            <div><span className="text-slate-500 block">Pcs / Carton</span><span className="font-medium">{product.carton_size || '-'}</span></div>
            <div><span className="text-slate-500 block">Shelf Life</span><span className="font-medium">{product.shelf_life_months ? `${product.shelf_life_months} months` : `${product.shelf_life_days || '-'} days`}</span></div>
            <div><span className="text-slate-500 block">Brand</span><span className="font-medium">{product.brand || '-'}</span></div>
          </CardContent>
        </Card>
      )}

      {batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" /> Historical Batches ({batches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3">Batch #</th>
                  <th className="text-left p-3">Production Date</th>
                  <th className="text-left p-3">Expiry Date</th>
                  <th className="text-right p-3">Cartons</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3 font-mono font-semibold">{b.batch_number}</td>
                    <td className="p-3">{b.production_date ? fmtDay(b.production_date) : '-'}</td>
                    <td className="p-3">{b.expiry_date ? fmtDay(b.expiry_date) : '-'}</td>
                    <td className="p-3 text-right">{b.quantity_cartons ?? '-'}</td>
                    <td className="p-3 text-center"><Badge variant="outline">{b.status || 'active'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
