import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { parseQRPayload } from '@/lib/qrParser';
import { formatQtyBreakdown } from '@/lib/pickStock';
import { buildRackLayout, DEFAULT_STAGING_AREA } from '@/lib/rackLayout';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { playScanBeep } from '@/lib/scanFeedback';
import { exportToXlsx } from '@/lib/excelUtils';
import { CameraQRScanner } from '@/components/warehouse/QRScanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { QrCode, ClipboardCheck, Download, Plus } from 'lucide-react';
import { loadBatchOptions, loadProductOptions } from '@/lib/masterOptions';

export default function WmsWarehouse() {
  const [tab, setTab] = useState('scan');
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [rackLines, setRackLines] = useState<any[]>([]);
  const [stagingAreas, setStagingAreas] = useState<any[]>([]);

  // Scan-in state
  const [qrInput, setQrInput] = useState('');
  const [scanForm, setScanForm] = useState({
    item_code: '',
    item_name: '',
    batch_number: '',
    expiry_date: '',
    carton: '',
    pcs_per_carton: '24',
    loose_pcs: '',
    rack: DEFAULT_STAGING_AREA,
    goods_status: 'good',
  });

  // Stock Take state
  const [stockTakeName, setStockTakeName] = useState('');
  const [activeTake, setActiveTake] = useState<any | null>(null);
  const [takeItems, setTakeItems] = useState<any[]>([]);
  const [takeForm, setTakeForm] = useState({
    stock_item_id: '',
    item_code: '',
    item_name: '',
    batch_number: '',
    rack: DEFAULT_STAGING_AREA,
    carton: '',
    pcs_per_carton: '24',
    loose_pcs: '',
  });
  const [opts, setOpts] = useState<{ products: any[]; batches: any[]; batchRecords: any[] }>({
    products: [],
    batches: [],
    batchRecords: [],
  });

  const loadWms = async () => {
    const [sRes, lRes, stRes, prods, bats, batchRecRes, takeRes] = await Promise.all([
      supabase.from('wms_stock_items').select('*').eq('deleted', false).neq('status', 'shipped').order('scanned_at', { ascending: false }),
      supabase.from('rack_lines').select('*').eq('deleted', false).order('sort_order'),
      supabase.from('staging_areas').select('*').eq('deleted', false).order('sort_order'),
      loadProductOptions(),
      loadBatchOptions(),
      supabase.from('batch_records').select('batch_number, product_code, product_name, expiry_date, pcs_per_carton, quantity_cartons').eq('deleted', false).order('created_at', { ascending: false }).limit(500),
      supabase.from('stock_takes').select('*').eq('status', 'in_progress').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setStockItems(sRes.data || []);
    setRackLines(lRes.data || []);
    setStagingAreas(stRes.data || []);
    if (takeRes.data) {
      setActiveTake(takeRes.data);
      const { data: tItems } = await supabase
        .from('stock_take_items')
        .select('*')
        .eq('stock_take_id', takeRes.data.id)
        .order('counted_at', { ascending: false });
      setTakeItems(tItems || []);
    }
    setOpts({
      products: prods,
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
    const areaNames = [DEFAULT_STAGING_AREA, ...stagingAreas.map((a) => a.name).filter(Boolean)];
    return [...new Set([...areaNames, ...slotCodes])];
  }, [layout, stagingAreas]);

  const handleQrDecode = (raw: string) => {
    const res = parseQRPayload(raw);
    if (res.ok === false) {
      playScanBeep(false);
      toast.error(res.error);
      return;
    }
    playScanBeep(true);
    setScanForm((prev) => ({
      ...prev,
      item_code: res.data.item_code,
      item_name: res.data.item_name,
      batch_number: res.data.batch_number,
      expiry_date: res.data.expiry_date,
    }));
    toast.success(`Decoded ${res.data.format} QR: ${res.data.item_name}`);
  };

  useHardwareScanner((val) => {
    if (tab === 'scan') handleQrDecode(val);
  }, tab === 'scan');

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
      return toast.error('Enter cartons or loose pcs greater than zero.');
    }
    const targetRack = scanForm.rack || DEFAULT_STAGING_AREA;
    const nowIso = new Date().toISOString();

    // Upsert / Merge: if same (item_code, batch_number, rack) is already active in stock, add to it
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
        ...scanForm,
        rack: targetRack,
        carton: cartonNum,
        pcs_per_carton: pcsPerCartonNum,
        loose_pcs: loosePcsNum,
        quantity: totalQty,
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
      carton: cartonNum,
      pcs_per_carton: pcsPerCartonNum,
      loose_pcs: loosePcsNum,
      quantity: totalQty,
      rack: targetRack,
      scanned_at: nowIso,
    });

    toast.success(
      existing
        ? `Added ${formatQtyBreakdown(totalQty, pcsPerCartonNum)} to existing batch in ${targetRack}`
        : `Stocked in ${formatQtyBreakdown(totalQty, pcsPerCartonNum)} to ${targetRack}`
    );
    setQrInput('');
    setScanForm((prev) => ({ ...prev, carton: '', loose_pcs: '' }));
    loadWms();
  };

  const handleCompleteStockTake = async (applyVariance: boolean) => {
    if (!activeTake) return;
    if (applyVariance && takeItems.length > 0) {
      for (const ti of takeItems) {
        const match = stockItems.find(
          (s) =>
            String(s.item_code || '').trim().toUpperCase() === String(ti.item_code || '').trim().toUpperCase() &&
            String(s.batch_number || '').trim().toUpperCase() === String(ti.batch_number || '').trim().toUpperCase() &&
            String(s.rack || DEFAULT_STAGING_AREA).trim().toUpperCase() === String(ti.rack || DEFAULT_STAGING_AREA).trim().toUpperCase()
        );
        if (match) {
          const countedQty = Number(ti.quantity ?? ti.total_pcs) || 0;
          await supabase
            .from('wms_stock_items')
            .update({
              carton: Number(ti.carton ?? ti.cartons) || 0,
              loose_pcs: Number(ti.loose_pcs) || 0,
              quantity: countedQty,
              status: countedQty <= 0 ? 'shipped' : match.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.id);
        }
      }
    }
    await supabase
      .from('stock_takes')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', activeTake.id);
    toast.success(applyVariance ? 'Stock take completed & stock balances reconciled.' : 'Stock take completed (no stock changes applied).');
    setActiveTake(null);
    setTakeItems([]);
    loadWms();
  };

  const handleStartStockTake = async () => {
    const { data, error } = await supabase
      .from('stock_takes')
      .insert({ name: stockTakeName || `Count ${new Date().toISOString().slice(0, 10)}`, status: 'in_progress' })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setActiveTake(data);
    setTakeItems([]);
    toast.success('Stock take session started');
  };

  const handleAddStockTakeRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTake) return;
    if (!takeForm.item_code || !takeForm.batch_number) {
      return toast.error('Select a batch or enter Item Code and Batch #.');
    }
    const cartonNum = Number(takeForm.carton) || 0;
    const pcsPerCartonNum = Number(takeForm.pcs_per_carton) || 24;
    const looseNum = Number(takeForm.loose_pcs) || 0;
    const countedQty = cartonNum * pcsPerCartonNum + looseNum;
    const payload = {
      stock_take_id: activeTake.id,
      item_code: takeForm.item_code,
      item_name: takeForm.item_name,
      batch_number: takeForm.batch_number,
      rack: takeForm.rack || DEFAULT_STAGING_AREA,
      carton: cartonNum,
      pcs_per_carton: pcsPerCartonNum,
      loose_pcs: looseNum,
      quantity: countedQty,
      counted_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase.from('stock_take_items').insert(payload).select().single();
    if (error) return toast.error(error.message);
    setTakeItems((prev) => [inserted, ...prev]);
    setTakeForm((prev) => ({ ...prev, carton: '', loose_pcs: '' }));
    toast.success(`Counted ${takeForm.item_code} · ${takeForm.batch_number}`);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Finished Goods WMS</h2>
          <p className="text-[#64748B] text-sm mt-1">
            QR batch scan-in and physical stock takes.
          </p>
        </div>
        <Button
          variant="outline"
          className="bg-white border-[#E2E8F0] text-[#0F294A]"
          onClick={() => exportToXlsx(`wms_stock_${new Date().toISOString().slice(0, 10)}.xlsx`, 'WMS Stock', stockItems)}
        >
          <Download className="w-4 h-4 mr-1.5" /> Export Stock (.xlsx)
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="scan"><QrCode className="w-4 h-4 mr-1" /> QR Scan In</TabsTrigger>
          <TabsTrigger value="take"><ClipboardCheck className="w-4 h-4 mr-1" /> Stock Take</TabsTrigger>
        </TabsList>

        <TabsContent value="scan" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Scan Carton QR (Legacy 5-field or GTIN 7/8-field)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <CameraQRScanner
                onDecode={(decoded) => {
                  setQrInput(decoded);
                  handleQrDecode(decoded);
                }}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Paste or scan QR payload (e.g. Product|BATCH|2027-06-01|SKU|Desc)"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  className="font-mono"
                />
                <Button type="button" variant="secondary" onClick={() => handleQrDecode(qrInput)}>Decode QR</Button>
              </div>
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
                  placeholder="Item Code / SKU"
                  searchPlaceholder="Search product code..."
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
                  placeholder="Item Name"
                  searchPlaceholder="Search product name..."
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
                  placeholder="Batch # (auto-fills product & expiry)"
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
                  placeholder="Rack (e.g. G1A)"
                  searchPlaceholder="Search rack..."
                />
                <Button type="submit" className="md:col-span-4">Save Stock-In</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="take" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Physical Stock Take Session</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!activeTake ? (
                <div className="flex gap-2">
                  <Input placeholder="Session name (optional)" value={stockTakeName} onChange={(e) => setStockTakeName(e.target.value)} />
                  <Button onClick={handleStartStockTake}>Start Count Session</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge>Active: {activeTake.name}</Badge>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleCompleteStockTake(false)}>
                        Close Without Adjusting
                      </Button>
                      <Button size="sm" onClick={() => handleCompleteStockTake(true)}>
                        Apply Variance &amp; Complete
                      </Button>
                    </div>
                  </div>

                  <form onSubmit={handleAddStockTakeRow} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border rounded-lg p-3">
                    <div className="md:col-span-2">
                      <SearchableSelect
                        value={takeForm.stock_item_id}
                        onValueChange={(v) => {
                          const picked = stockItems.find((s) => s.id === v);
                          if (picked) {
                            setTakeForm({
                              stock_item_id: v,
                              item_code: picked.item_code || '',
                              item_name: picked.item_name || '',
                              batch_number: picked.batch_number || '',
                              rack: picked.rack || DEFAULT_STAGING_AREA,
                              carton: String(picked.carton ?? ''),
                              pcs_per_carton: String(picked.pcs_per_carton || 24),
                              loose_pcs: String(picked.loose_pcs ?? ''),
                            });
                          }
                        }}
                        options={stockItems.map((s) => ({
                          value: s.id,
                          label: `${s.item_code} · ${s.batch_number} (${s.rack || DEFAULT_STAGING_AREA})`,
                          sublabel: `${s.carton} ctn + ${s.loose_pcs} loose`,
                        }))}
                        placeholder="Quick-fill from stock batch..."
                        searchPlaceholder="Search batch or item..."
                      />
                    </div>
                    <SearchableSelect
                      value={takeForm.rack}
                      onValueChange={(v) => setTakeForm({ ...takeForm, rack: v })}
                      options={rackOptions}
                      placeholder="Rack"
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Counted Cartons"
                      value={takeForm.carton}
                      onChange={(e) => setTakeForm({ ...takeForm, carton: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Loose Pcs"
                      value={takeForm.loose_pcs}
                      onChange={(e) => setTakeForm({ ...takeForm, loose_pcs: e.target.value })}
                    />
                    <Button type="submit">
                      <Plus className="w-4 h-4 mr-1" /> Add Count
                    </Button>
                  </form>

                  <p className="text-xs text-slate-500">Counted rows: {takeItems.length}</p>
                  {takeItems.length > 0 && (
                    <div className="border rounded-md overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left p-2.5">Item</th>
                            <th className="text-left p-2.5">Batch</th>
                            <th className="text-left p-2.5">Rack</th>
                            <th className="text-right p-2.5">System Qty</th>
                            <th className="text-right p-2.5">Counted Qty</th>
                            <th className="text-right p-2.5">Variance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {takeItems.map((ti) => {
                            const sysMatch = stockItems.find(
                              (s) =>
                                String(s.item_code || '').trim().toUpperCase() === String(ti.item_code || '').trim().toUpperCase() &&
                                String(s.batch_number || '').trim().toUpperCase() === String(ti.batch_number || '').trim().toUpperCase() &&
                                String(s.rack || DEFAULT_STAGING_AREA).trim().toUpperCase() === String(ti.rack || DEFAULT_STAGING_AREA).trim().toUpperCase()
                            );
                            const sysQty = Number(sysMatch?.quantity) || 0;
                            const countedQty = Number(ti.quantity ?? ti.total_pcs) || 0;
                            const variance = countedQty - sysQty;
                            return (
                              <tr key={ti.id}>
                                <td className="p-2.5 font-medium">{ti.item_code} — {ti.item_name}</td>
                                <td className="p-2.5 font-mono">{ti.batch_number}</td>
                                <td className="p-2.5">{ti.rack}</td>
                                <td className="p-2.5 text-right font-mono text-slate-500">{formatQtyBreakdown(sysQty, ti.pcs_per_carton)}</td>
                                <td className="p-2.5 text-right font-mono">{formatQtyBreakdown(countedQty, ti.pcs_per_carton)}</td>
                                <td className={`p-2.5 text-right font-mono font-semibold ${variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-sky-600' : 'text-rose-600'}`}>
                                  {variance > 0 ? `+${variance}` : variance} pcs
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
