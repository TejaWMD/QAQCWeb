import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { parseQRPayload } from '@/lib/qrParser';
import { computePickUpdate, formatQtyBreakdown } from '@/lib/pickStock';
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
import { QrCode, LayoutGrid, PackageMinus, ClipboardCheck, Download, Plus } from 'lucide-react';
import { loadBatchOptions, loadProductOptions } from '@/lib/masterOptions';

export default function WmsWarehouse() {
  const [tab, setTab] = useState('rack');
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [rackLines, setRackLines] = useState<any[]>([]);
  const [stagingAreas, setStagingAreas] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Scan-in state
  const [qrInput, setQrInput] = useState('');
  const [scanForm, setScanForm] = useState({
    item_code: '',
    item_name: '',
    batch_number: '',
    expiry_date: '',
    carton: 0,
    pcs_per_carton: 24,
    loose_pcs: 0,
    rack: DEFAULT_STAGING_AREA,
    goods_status: 'good',
  });

  // PL Out state
  const [plNumber, setPlNumber] = useState('');
  const [plPickItemId, setPlPickItemId] = useState('');
  const [plCartons, setPlCartons] = useState(0);
  const [plLoose, setPlLoose] = useState(0);

  // Stock Take state
  const [stockTakeName, setStockTakeName] = useState('');
  const [activeTake, setActiveTake] = useState<any | null>(null);
  const [takeItems, setTakeItems] = useState<any[]>([]);
  const [opts, setOpts] = useState<{ products: any[]; batches: any[]; openPls: any[] }>({
    products: [],
    batches: [],
    openPls: [],
  });

  const loadWms = async () => {
    const [sRes, lRes, stRes, plRes, prods, bats] = await Promise.all([
      supabase.from('wms_stock_items').select('*').eq('deleted', false).neq('status', 'shipped').order('scanned_at', { ascending: false }),
      supabase.from('rack_lines').select('*').eq('deleted', false).order('sort_order'),
      supabase.from('staging_areas').select('*').eq('deleted', false).order('sort_order'),
      supabase.from('pl_outs').select('pl_number, status').eq('status', 'in_progress').order('created_at', { ascending: false }).limit(100),
      loadProductOptions(),
      loadBatchOptions(),
    ]);
    setStockItems(sRes.data || []);
    setRackLines(lRes.data || []);
    setStagingAreas(stRes.data || []);
    setOpts({
      products: prods,
      batches: bats,
      openPls: (plRes.data || []).map((p: any) => p.pl_number).filter(Boolean),
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

  const itemsByRack = useMemo(() => {
    const map = new Map<string, any[]>();
    stockItems.forEach((item) => {
      const key = item.rack || DEFAULT_STAGING_AREA;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [stockItems]);

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
    const totalQty = scanForm.carton * scanForm.pcs_per_carton + scanForm.loose_pcs;
    const payload = {
      ...scanForm,
      quantity: totalQty,
      status: scanForm.rack && scanForm.rack !== DEFAULT_STAGING_AREA ? 'stored' : 'received',
      scanned_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await supabase.from('wms_stock_items').insert(payload).select().single();
    if (error) return toast.error(error.message);

    await supabase.from('wms_stock_in_logs').insert({
      stock_item_id: inserted.id,
      item_code: payload.item_code,
      item_name: payload.item_name,
      batch_number: payload.batch_number,
      carton: payload.carton,
      pcs_per_carton: payload.pcs_per_carton,
      loose_pcs: payload.loose_pcs,
      quantity: totalQty,
      rack: payload.rack,
      scanned_at: payload.scanned_at,
    });

    toast.success(`Stocked in ${formatQtyBreakdown(totalQty, scanForm.pcs_per_carton)} to ${scanForm.rack}`);
    setQrInput('');
    loadWms();
  };

  const handleAddRackLine = async () => {
    const nextIdx = rackLines.length + 1;
    const { error } = await supabase.from('rack_lines').insert({
      name: `Line ${nextIdx}`,
      rack_count: 3,
      sort_order: nextIdx,
    });
    if (error) return toast.error(error.message);
    loadWms();
  };

  const handleMoveRack = async (itemId: string, newRack: string) => {
    const { error } = await supabase
      .from('wms_stock_items')
      .update({ rack: newRack, status: newRack === DEFAULT_STAGING_AREA ? 'received' : 'stored' })
      .eq('id', itemId);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${newRack}`);
    loadWms();
  };

  const handlePlPick = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = stockItems.find((s) => s.id === plPickItemId);
    if (!item || !plNumber.trim()) return toast.error('Select a stock batch and enter PL Number.');

    try {
      const result = computePickUpdate(item, plCartons, plLoose);
      let { data: plHeader } = await supabase
        .from('pl_outs')
        .select('*')
        .eq('pl_number', plNumber.trim())
        .eq('status', 'in_progress')
        .maybeSingle();

      if (!plHeader) {
        const { data: createdPl, error: plErr } = await supabase
          .from('pl_outs')
          .insert({ pl_number: plNumber.trim(), status: 'in_progress' })
          .select()
          .single();
        if (plErr) throw plErr;
        plHeader = createdPl;
      }

      await supabase
        .from('wms_stock_items')
        .update({
          carton: result.carton,
          loose_pcs: result.loose_pcs,
          quantity: result.quantity,
          status: result.status,
          rack: result.rack_cleared ? null : item.rack,
        })
        .eq('id', item.id);

      await supabase.from('pl_out_items').insert({
        pl_out_id: plHeader.id,
        pl_number: plNumber.trim(),
        stock_item_id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        batch_number: item.batch_number,
        rack: item.rack,
        cartons: plCartons,
        pcs_per_carton: item.pcs_per_carton,
        loose_pcs: plLoose,
        total_pcs: result.picked_total_pcs,
      });

      toast.success(`Picked ${result.picked_total_pcs} pcs for PL ${plNumber}`);
      setPlCartons(0);
      setPlLoose(0);
      loadWms();
    } catch (err: any) {
      toast.error(err.message);
    }
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-indigo-600" />
            Finished Goods WMS (ScanStock)
          </h1>
          <p className="text-sm text-slate-500">
            QR batch scan-in, visual G/M/T rack floor, PL outbound picking with carton-breaking, and stock takes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportToXlsx(`wms_stock_${new Date().toISOString().slice(0, 10)}.xlsx`, 'WMS Stock', stockItems)}
        >
          <Download className="w-4 h-4 mr-1" /> Export Stock (.xlsx)
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rack"><LayoutGrid className="w-4 h-4 mr-1" /> Rack Floor ({stockItems.length})</TabsTrigger>
          <TabsTrigger value="scan"><QrCode className="w-4 h-4 mr-1" /> QR Scan In</TabsTrigger>
          <TabsTrigger value="plout"><PackageMinus className="w-4 h-4 mr-1" /> PL Outbound Pick</TabsTrigger>
          <TabsTrigger value="take"><ClipboardCheck className="w-4 h-4 mr-1" /> Stock Take</TabsTrigger>
        </TabsList>

        <TabsContent value="rack" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Staging: <Badge variant="secondary">{DEFAULT_STAGING_AREA} ({itemsByRack.get(DEFAULT_STAGING_AREA)?.length || 0})</Badge>
              {stagingAreas.map((st) => (
                <Badge key={st.id} variant="outline" className="ml-2">
                  {st.name} ({itemsByRack.get(st.name)?.length || 0})
                </Badge>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={handleAddRackLine}>
              <Plus className="w-4 h-4 mr-1" /> Add Rack Line
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {layout.map((line) => (
              <Card key={line.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{line.name}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  {line.racks.map((rack) => (
                    <div key={rack.rackNumber} className="border rounded-md p-2 space-y-1 bg-slate-50">
                      <div className="text-xs font-semibold text-slate-500">Rack #{rack.rackNumber}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {rack.slots.map((slot) => {
                          const count = itemsByRack.get(slot.code)?.length || 0;
                          return (
                            <button
                              key={slot.code}
                              onClick={() => setSelectedSlot(slot.code)}
                              className={`text-xs p-1.5 rounded border text-center font-mono ${
                                count > 0
                                  ? 'bg-indigo-600 text-white border-indigo-700'
                                  : 'bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {slot.code} {count > 0 ? `(${count})` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedSlot ? `Slot ${selectedSlot} Contents` : 'All Active Warehouse Batches'}
                {selectedSlot && (
                  <Button size="sm" variant="ghost" className="ml-2" onClick={() => setSelectedSlot(null)}>
                    Show All
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Item</th>
                    <th className="text-left p-3">Batch</th>
                    <th className="text-left p-3">Expiry</th>
                    <th className="text-left p-3">Qty</th>
                    <th className="text-left p-3">Rack</th>
                    <th className="text-right p-3">Move</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(selectedSlot ? itemsByRack.get(selectedSlot) || [] : stockItems).map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <div className="font-medium">{item.item_name}</div>
                        <div className="text-xs text-slate-500 font-mono">{item.item_code}</div>
                      </td>
                      <td className="p-3 font-mono">{item.batch_number}</td>
                      <td className="p-3">{item.expiry_date}</td>
                      <td className="p-3 text-xs font-mono">{formatQtyBreakdown(item.quantity, item.pcs_per_carton)}</td>
                      <td className="p-3"><Badge variant="outline">{item.rack || DEFAULT_STAGING_AREA}</Badge></td>
                      <td className="p-3 text-right">
                        <div className="w-36 inline-block text-left">
                          <SearchableSelect
                            value={item.rack || DEFAULT_STAGING_AREA}
                            onValueChange={(v) => {
                              if (v && v !== (item.rack || DEFAULT_STAGING_AREA)) {
                                handleMoveRack(item.id, v);
                              }
                            }}
                            options={rackOptions}
                            placeholder="Move rack..."
                            searchPlaceholder="Search rack..."
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

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
                      ...(match ? { item_name: match.product_name, pcs_per_carton: Number(match.carton_size) || scanForm.pcs_per_carton } : {}),
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
                      ...(match ? { item_code: match.product_code, pcs_per_carton: Number(match.carton_size) || scanForm.pcs_per_carton } : {}),
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
                  onValueChange={(v) => setScanForm({ ...scanForm, batch_number: v })}
                  options={opts.batches}
                  placeholder="Batch #"
                  searchPlaceholder="Search batch..."
                  allowCustom
                />
                <Input type="date" value={scanForm.expiry_date} onChange={(e) => setScanForm({ ...scanForm, expiry_date: e.target.value })} />
                <Input type="number" placeholder="Cartons" value={scanForm.carton} onChange={(e) => setScanForm({ ...scanForm, carton: Number(e.target.value) })} />
                <Input type="number" placeholder="Pcs / Carton" value={scanForm.pcs_per_carton} onChange={(e) => setScanForm({ ...scanForm, pcs_per_carton: Number(e.target.value) })} />
                <Input type="number" placeholder="Loose Pcs" value={scanForm.loose_pcs} onChange={(e) => setScanForm({ ...scanForm, loose_pcs: Number(e.target.value) })} />
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

        <TabsContent value="plout" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Packing List Outbound Pick (Auto Carton-Breaking)</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handlePlPick} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <SearchableSelect
                  value={plNumber}
                  onValueChange={setPlNumber}
                  options={opts.openPls}
                  placeholder="PL Number (e.g. PL-2026-001)"
                  searchPlaceholder="Search or enter PL..."
                  allowCustom
                />
                <div className="md:col-span-2">
                  <SearchableSelect
                    value={plPickItemId}
                    onValueChange={setPlPickItemId}
                    options={stockItems.map((s) => ({
                      value: s.id,
                      label: `${s.item_code} · ${s.batch_number} (${s.rack || DEFAULT_STAGING_AREA})`,
                      sublabel: `${s.carton} ctn + ${s.loose_pcs} loose`,
                    }))}
                    placeholder="Select Batch & Rack..."
                    searchPlaceholder="Search batch or item..."
                  />
                </div>
                <Input type="number" min={0} placeholder="Cartons Out" value={plCartons} onChange={(e) => setPlCartons(Number(e.target.value))} />
                <Input type="number" min={0} placeholder="Loose Pcs Out" value={plLoose} onChange={(e) => setPlLoose(Number(e.target.value))} />
                <Button type="submit" className="md:col-span-5">Deduct Pick from Stock</Button>
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge>Active: {activeTake.name}</Badge>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await supabase.from('stock_takes').update({ status: 'completed' }).eq('id', activeTake.id);
                        toast.success('Stock take completed');
                        setActiveTake(null);
                      }}
                    >
                      Complete Session
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Counted rows: {takeItems.length}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
