import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { matchParsedQrToProduct, parseQRPayload } from '@/lib/qrParser';
import { formatQtyBreakdown } from '@/lib/pickStock';
import { buildRackLayout, DEFAULT_STAGING_AREA } from '@/lib/rackLayout';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { playScanBeep } from '@/lib/scanFeedback';
import { exportToXlsx } from '@/lib/excelUtils';
import { CameraQRScanner } from '@/components/warehouse/QRScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { Download, Pencil, Trash2, ArrowUpFromLine } from 'lucide-react';
import { loadBatchOptions } from '@/lib/masterOptions';
import { fmtDay } from '@/lib/labels';

export default function WmsWarehouse() {
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [rackLines, setRackLines] = useState<any[]>([]);
  const [stagingAreas, setStagingAreas] = useState<any[]>([]);
  const [warehouseRacks, setWarehouseRacks] = useState<string[]>([]);

  const [qrInput, setQrInput] = useState('');
  const [decodedSummary, setDecodedSummary] = useState<any | null>(null);
  const [scanForm, setScanForm] = useState({
    item_code: '',
    item_name: '',
    batch_number: '',
    production_date: '',
    expiry_date: '',
    barcode: '',
    carton: '',
    pcs_per_carton: '24',
    loose_pcs: '',
    rack: DEFAULT_STAGING_AREA,
    goods_status: 'good',
  });

  const [issueTarget, setIssueTarget] = useState<any | null>(null);
  const [issueCartons, setIssueCartons] = useState('');
  const [issueLoose, setIssueLoose] = useState('');

  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ carton: '', loose_pcs: '', rack: DEFAULT_STAGING_AREA });

  const [opts, setOpts] = useState<{ products: any[]; batches: any[]; batchRecords: any[] }>({
    products: [],
    batches: [],
    batchRecords: [],
  });

  const loadWms = async () => {
    const [sRes, lRes, stRes, wrRes, prodsRes, bats, batchRecRes] = await Promise.all([
      supabase.from('wms_stock_items').select('*').eq('deleted', false).neq('status', 'shipped').order('scanned_at', { ascending: false }),
      supabase.from('rack_lines').select('*').eq('deleted', false).order('sort_order'),
      supabase.from('staging_areas').select('*').eq('deleted', false).order('sort_order'),
      supabase.from('warehouse_racks').select('rack_code').eq('deleted', false).eq('status', 'Active').order('rack_code'),
      supabase.from('products').select('*').neq('deleted', true).order('product_code'),
      loadBatchOptions(),
      supabase.from('batch_records').select('batch_number, product_code, product_name, production_date, expiry_date, pcs_per_carton, quantity_cartons, carton_barcode').eq('deleted', false).order('created_at', { ascending: false }).limit(500),
    ]);
    setStockItems(sRes.data || []);
    setRackLines(lRes.data || []);
    setStagingAreas(stRes.data || []);
    setWarehouseRacks((wrRes.data || []).map((r: any) => r.rack_code).filter(Boolean));
    setOpts({
      products: prodsRes.data || [],
      batches: bats,
      batchRecords: batchRecRes.data || [],
    });
  };

  useEffect(() => {
    loadWms();
  }, []);

  const layout = useMemo(() => buildRackLayout(rackLines), [rackLines]);

  const rackOptions = useMemo(() => {
    const slotCodes = layout.flatMap((line) =>
      line.racks.flatMap((r) => r.slots.map((s) => s.code))
    );
    const areaNames = [DEFAULT_STAGING_AREA, 'Staging Area', ...stagingAreas.map((a) => a.name).filter(Boolean)];
    const activeStockRacks = stockItems.map((s) => s.rack).filter(Boolean);
    return [...new Set([...areaNames, ...warehouseRacks, ...slotCodes, ...activeStockRacks])];
  }, [layout, stagingAreas, warehouseRacks, stockItems]);

  const handleQrDecode = (raw: string) => {
    const res = parseQRPayload(raw);
    if (res.ok === false) {
      playScanBeep(false);
      toast.error(res.error);
      return;
    }
    playScanBeep(true);

    const matchedProd = matchParsedQrToProduct(res.data, opts.products);
    const matchedBatch = res.data.batch_number
      ? opts.batchRecords.find(
          (b) => String(b.batch_number || '').trim().toUpperCase() === res.data.batch_number.toUpperCase()
        )
      : null;

    const resolvedCode =
      matchedProd?.product_code ||
      matchedBatch?.product_code ||
      res.data.item_code ||
      '';
    const resolvedName =
      matchedProd?.product_name ||
      matchedBatch?.product_name ||
      res.data.item_name ||
      '';
    const resolvedPcsPerCarton =
      Number(matchedProd?.carton_size) ||
      Number(matchedBatch?.pcs_per_carton) ||
      Number(scanForm.pcs_per_carton) ||
      24;
    const resolvedProdDate =
      res.data.manufacturing_date ||
      (matchedBatch?.production_date ? String(matchedBatch.production_date).slice(0, 10) : '');
    const resolvedExpDate =
      res.data.expiry_date ||
      (matchedBatch?.expiry_date ? String(matchedBatch.expiry_date).slice(0, 10) : '');

    setDecodedSummary({
      batch_number: res.data.batch_number,
      barcode: res.data.gtin || matchedProd?.carton_barcode || matchedProd?.barcode || '',
      production_date: resolvedProdDate,
      expiry_date: resolvedExpDate,
      product_name: resolvedName,
      item_code: resolvedCode,
    });

    setScanForm((prev) => ({
      ...prev,
      item_code: resolvedCode || prev.item_code,
      item_name: resolvedName || prev.item_name,
      batch_number: res.data.batch_number || prev.batch_number,
      production_date: resolvedProdDate || prev.production_date,
      expiry_date: resolvedExpDate || prev.expiry_date,
      barcode: res.data.gtin || matchedProd?.carton_barcode || prev.barcode,
      pcs_per_carton: String(resolvedPcsPerCarton),
    }));

    toast.success(resolvedName ? `${resolvedName} (${resolvedCode})` : res.data.batch_number);
  };

  useHardwareScanner((val) => {
    setQrInput(val);
    handleQrDecode(val);
  }, true);

  const handleSaveScanIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanForm.item_code || !scanForm.batch_number || !scanForm.expiry_date) {
      return toast.error('Item code, batch number, and expiry date are required.');
    }
    const cartonNum = Number(scanForm.carton) || 0;
    const pcsPerCartonNum = Number(scanForm.pcs_per_carton) || 24;
    const loosePcsNum = Number(scanForm.loose_pcs) || 0;
    const totalQty = cartonNum * pcsPerCartonNum + loosePcsNum;
    if (totalQty <= 0) {
      return toast.error('Enter cartons or loose pcs.');
    }
    const targetRack = scanForm.rack || DEFAULT_STAGING_AREA;
    const nowIso = new Date().toISOString();

    const existing = stockItems.find(
      (s) =>
        String(s.item_code || '').trim().toUpperCase() === scanForm.item_code.trim().toUpperCase() &&
        String(s.batch_number || '').trim().toUpperCase() === scanForm.batch_number.trim().toUpperCase() &&
        String(s.rack || DEFAULT_STAGING_AREA).trim().toUpperCase() === targetRack.trim().toUpperCase()
    );

    let savedId = '';
    if (existing) {
      const nextCarton = (Number(existing.carton) || 0) + cartonNum;
      const nextLoose = (Number(existing.loose_pcs) || 0) + loosePcsNum;
      const nextQty = (Number(existing.quantity) || 0) + totalQty;
      const { data: updated, error } = await supabase
        .from('wms_stock_items')
        .update({
          carton: nextCarton,
          loose_pcs: nextLoose,
          quantity: nextQty,
          scanned_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return toast.error(error.message);
      savedId = updated.id;
    } else {
      const payload = {
        item_code: scanForm.item_code,
        item_name: scanForm.item_name,
        batch_number: scanForm.batch_number,
        manufacturing_date: scanForm.production_date || null,
        gtin: scanForm.barcode || null,
        expiry_date: scanForm.expiry_date,
        rack: targetRack,
        carton: cartonNum,
        pcs_per_carton: pcsPerCartonNum,
        loose_pcs: loosePcsNum,
        quantity: totalQty,
        goods_status: scanForm.goods_status,
        status: targetRack !== DEFAULT_STAGING_AREA ? 'stored' : 'received',
        scanned_at: nowIso,
      };
      const { data: inserted, error } = await supabase.from('wms_stock_items').insert(payload).select().single();
      if (error) return toast.error(error.message);
      savedId = inserted.id;
    }

    await supabase.from('wms_stock_in_logs').insert({
      stock_item_id: savedId,
      item_code: scanForm.item_code,
      item_name: scanForm.item_name,
      batch_number: scanForm.batch_number,
      manufacturing_date: scanForm.production_date || null,
      gtin: scanForm.barcode || null,
      carton: cartonNum,
      pcs_per_carton: pcsPerCartonNum,
      loose_pcs: loosePcsNum,
      quantity: totalQty,
      rack: targetRack,
      scanned_at: nowIso,
    });

    toast.success(`Received ${formatQtyBreakdown(totalQty, pcsPerCartonNum)} → ${targetRack}`);
    setQrInput('');
    setDecodedSummary(null);
    setScanForm((prev) => ({ ...prev, carton: '', loose_pcs: '' }));
    loadWms();
  };

  const handleIssueStock = async () => {
    if (!issueTarget) return;
    const pcsPerCtn = Number(issueTarget.pcs_per_carton) || 24;
    const ctnOut = Number(issueCartons) || 0;
    const looseOut = Number(issueLoose) || 0;
    const totalOut = ctnOut * pcsPerCtn + looseOut;
    if (totalOut <= 0) return toast.error('Enter quantity to issue.');
    const currentQty = Number(issueTarget.quantity) || 0;
    if (totalOut > currentQty) return toast.error('Exceeds available stock.');

    const remainQty = currentQty - totalOut;
    const remainCarton = Math.floor(remainQty / pcsPerCtn);
    const remainLoose = remainQty % pcsPerCtn;

    const { error } = await supabase
      .from('wms_stock_items')
      .update({
        carton: remainCarton,
        loose_pcs: remainLoose,
        quantity: remainQty,
        status: remainQty <= 0 ? 'shipped' : issueTarget.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', issueTarget.id);

    if (error) return toast.error(error.message);
    toast.success(`Issued ${formatQtyBreakdown(totalOut, pcsPerCtn)}`);
    setIssueTarget(null);
    setIssueCartons('');
    setIssueLoose('');
    loadWms();
  };

  const handleSaveEditStock = async () => {
    if (!editTarget) return;
    const pcsPerCtn = Number(editTarget.pcs_per_carton) || 24;
    const nextCtn = Number(editForm.carton) || 0;
    const nextLoose = Number(editForm.loose_pcs) || 0;
    const nextQty = nextCtn * pcsPerCtn + nextLoose;
    const nextRack = editForm.rack || DEFAULT_STAGING_AREA;
    const { error } = await supabase
      .from('wms_stock_items')
      .update({
        carton: nextCtn,
        loose_pcs: nextLoose,
        quantity: nextQty,
        rack: nextRack,
        status: nextQty <= 0 ? 'shipped' : nextRack !== DEFAULT_STAGING_AREA ? 'stored' : 'received',
        updated_at: new Date().toISOString(),
      })
      .eq('id', editTarget.id);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${editTarget.batch_number}`);
    setEditTarget(null);
    loadWms();
  };

  const handleDeleteStock = async (item: any) => {
    if (!window.confirm(`Delete "${item.item_name}" (${item.batch_number})?`)) return;
    const { error } = await supabase
      .from('wms_stock_items')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    loadWms();
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[#0F294A] text-lg font-semibold">Finished Goods WMS</h2>
        <Button
          variant="outline"
          className="bg-white border-[#E2E8F0] text-[#0F294A]"
          onClick={() => exportToXlsx(`wms_stock_${new Date().toISOString().slice(0, 10)}.xlsx`, 'WMS Stock', stockItems)}
        >
          <Download className="w-4 h-4 mr-1.5" /> Export
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Carton QR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CameraQRScanner
            onDecode={(decoded) => {
              setQrInput(decoded);
              handleQrDecode(decoded);
            }}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Paste or scan QR payload"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQrDecode(qrInput);
                }
              }}
              className="font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={() => handleQrDecode(qrInput)}>Decode</Button>
          </div>

          {decodedSummary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <span className="text-slate-500 block">Product</span>
                <span className="font-semibold text-[#0F294A]">{decodedSummary.product_name || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Item Code</span>
                <span className="font-mono font-semibold text-[#0F294A]">{decodedSummary.item_code || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Batch</span>
                <span className="font-mono font-semibold text-[#1D4ED8]">{decodedSummary.batch_number || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Barcode</span>
                <span className="font-mono">{decodedSummary.barcode || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Prod / Exp</span>
                <span>{decodedSummary.production_date ? `${fmtDay(decodedSummary.production_date)} → ` : ''}{decodedSummary.expiry_date ? fmtDay(decodedSummary.expiry_date) : '—'}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSaveScanIn} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <SearchableSelect
              value={scanForm.item_code}
              onValueChange={(v) => {
                const match = opts.products.find((p) => p.product_code === v);
                setScanForm({
                  ...scanForm,
                  item_code: v,
                  ...(match ? { item_name: match.product_name, pcs_per_carton: String(Number(match.carton_size) || scanForm.pcs_per_carton) } : {}),
                });
              }}
              options={opts.products.map((p) => ({
                value: p.product_code,
                label: `${p.product_code} — ${p.product_name}`,
              }))}
              placeholder="Item Code"
              searchPlaceholder="Search code..."
              allowCustom
            />
            <SearchableSelect
              value={scanForm.item_name}
              onValueChange={(v) => {
                const match = opts.products.find((p) => p.product_name === v);
                setScanForm({
                  ...scanForm,
                  item_name: v,
                  ...(match ? { item_code: match.product_code, pcs_per_carton: String(Number(match.carton_size) || scanForm.pcs_per_carton) } : {}),
                });
              }}
              options={opts.products.map((p) => ({
                value: p.product_name,
                label: p.product_name,
                sublabel: p.product_code,
              }))}
              placeholder="Product Name"
              searchPlaceholder="Search product..."
              allowCustom
            />
            <SearchableSelect
              value={scanForm.batch_number}
              onValueChange={(v) => {
                const bMatch = opts.batchRecords.find(
                  (b) => String(b.batch_number || '').trim().toUpperCase() === String(v || '').trim().toUpperCase()
                );
                const pMatch = bMatch
                  ? opts.products.find((p) => p.product_code === bMatch.product_code || p.product_name === bMatch.product_name)
                  : null;
                setScanForm({
                  ...scanForm,
                  batch_number: v,
                  ...(bMatch ? {
                    item_code: bMatch.product_code || pMatch?.product_code || scanForm.item_code,
                    item_name: bMatch.product_name || pMatch?.product_name || scanForm.item_name,
                    expiry_date: bMatch.expiry_date ? String(bMatch.expiry_date).slice(0, 10) : scanForm.expiry_date,
                    pcs_per_carton: String(Number(bMatch.pcs_per_carton) || Number(pMatch?.carton_size) || scanForm.pcs_per_carton),
                    carton: scanForm.carton || (bMatch.quantity_cartons ? String(bMatch.quantity_cartons) : ''),
                  } : {}),
                });
              }}
              options={opts.batches}
              placeholder="Batch #"
              searchPlaceholder="Search batch..."
              allowCustom
            />
            <Input type="date" value={scanForm.expiry_date} onChange={(e) => setScanForm({ ...scanForm, expiry_date: e.target.value })} />
            <Input type="number" min={0} placeholder="Cartons" value={scanForm.carton} onChange={(e) => setScanForm({ ...scanForm, carton: e.target.value })} />
            <Input type="number" min={1} placeholder="Pcs / Carton" value={scanForm.pcs_per_carton} onChange={(e) => setScanForm({ ...scanForm, pcs_per_carton: e.target.value })} />
            <Input type="number" min={0} placeholder="Loose Pcs" value={scanForm.loose_pcs} onChange={(e) => setScanForm({ ...scanForm, loose_pcs: e.target.value })} />
            <SearchableSelect
              value={scanForm.rack}
              onValueChange={(v) => setScanForm({ ...scanForm, rack: v })}
              options={rackOptions}
              placeholder="Rack"
              searchPlaceholder="Search rack..."
              allowCustom
            />
            <Button type="submit" className="md:col-span-4 bg-[#0F294A] hover:bg-[#193B68] text-white">
              Receive Stock-In
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Warehouse Stock ({stockItems.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-xs text-slate-500">
              <tr>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Item Code</th>
                <th className="text-left p-3">Batch #</th>
                <th className="text-left p-3">Expiry</th>
                <th className="text-left p-3">Rack</th>
                <th className="text-right p-3">Balance</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    No stock items yet.
                  </td>
                </tr>
              ) : (
                stockItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-[#0F294A]">{item.item_name || '—'}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{item.item_code}</td>
                    <td className="p-3 font-mono font-semibold text-[#1D4ED8]">{item.batch_number}</td>
                    <td className="p-3 text-slate-600">{item.expiry_date ? fmtDay(item.expiry_date) : '—'}</td>
                    <td className="p-3"><Badge variant="outline">{item.rack || DEFAULT_STAGING_AREA}</Badge></td>
                    <td className="p-3 text-right font-mono font-medium">
                      {formatQtyBreakdown(Number(item.quantity) || 0, Number(item.pcs_per_carton) || 24)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIssueTarget(item);
                            setIssueCartons('');
                            setIssueLoose('');
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <ArrowUpFromLine className="w-3.5 h-3.5 mr-1" /> Issue
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:text-[#1D4ED8]"
                          onClick={() => {
                            setEditTarget(item);
                            setEditForm({
                              carton: String(item.carton ?? 0),
                              loose_pcs: String(item.loose_pcs ?? 0),
                              rack: item.rack || DEFAULT_STAGING_AREA,
                            });
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-500 hover:text-rose-700"
                          onClick={() => handleDeleteStock(item)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!issueTarget} onOpenChange={(o) => !o && setIssueTarget(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Issue · {issueTarget?.batch_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 text-sm">
            <p className="text-xs text-slate-500">
              {issueTarget?.item_name} ({issueTarget?.item_code}) · Available:{' '}
              {formatQtyBreakdown(Number(issueTarget?.quantity) || 0, Number(issueTarget?.pcs_per_carton) || 24)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Cartons</label>
                <Input type="number" min={0} value={issueCartons} onChange={(e) => setIssueCartons(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Loose Pcs</label>
                <Input type="number" min={0} value={issueLoose} onChange={(e) => setIssueLoose(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setIssueTarget(null)} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Cancel</Button>
            <Button type="button" onClick={handleIssueStock} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit · {editTarget?.batch_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Cartons</label>
                <Input type="number" min={0} value={editForm.carton} onChange={(e) => setEditForm({ ...editForm, carton: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Loose Pcs</label>
                <Input type="number" min={0} value={editForm.loose_pcs} onChange={(e) => setEditForm({ ...editForm, loose_pcs: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Rack</label>
              <SearchableSelect
                value={editForm.rack}
                onValueChange={(v) => setEditForm({ ...editForm, rack: v })}
                options={rackOptions}
                placeholder="Rack"
                allowCustom
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Cancel</Button>
            <Button type="button" onClick={handleSaveEditStock} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
