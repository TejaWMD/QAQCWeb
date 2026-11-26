import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { actingUserName } from '@/lib/permissions';
import { matchParsedQrToProduct, parseQRPayload } from '@/lib/qrParser';
import { formatQtyBreakdown } from '@/lib/pickStock';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { playScanBeep } from '@/lib/scanFeedback';
import { exportToXlsx } from '@/lib/excelUtils';
import { CameraQRScanner } from '@/components/warehouse/QRScanner';
import {
  DEFAULT_POSITIVE_RELEASES,
  loadQaSection,
  saveQaSection,
} from '@/lib/qaHaccpStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, Download, Pencil, Trash2 } from 'lucide-react';
import { loadBatchOptions } from '@/lib/masterOptions';
import { fmtDay } from '@/lib/labels';

interface PositiveReleaseRecord {
  id: string;
  item_code: string;
  item_name: string;
  batch_number: string;
  production_date: string;
  expiry_date: string;
  barcode: string;
  all_parameters_in_control: boolean;
  remarks: string;
  carton: number;
  pcs_per_carton: number;
  loose_pcs: number;
  quantity: number;
  status: 'Released' | 'Not In Control';
  released_by: string;
  released_at: string;
}

const EMPTY_SCAN_FORM = {
  item_code: '',
  item_name: '',
  batch_number: '',
  production_date: '',
  expiry_date: '',
  barcode: '',
  all_parameters_in_control: 'yes' as 'yes' | 'no',
  remarks: '',
  carton: '',
  pcs_per_carton: '24',
  loose_pcs: '',
};

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

export default function ProductPositiveRelease() {
  const { user } = useAuth();
  const [releases, setReleases] = useState<PositiveReleaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [qrInput, setQrInput] = useState('');
  const [decodedSummary, setDecodedSummary] = useState<any | null>(null);
  const [scanForm, setScanForm] = useState(EMPTY_SCAN_FORM);

  const [editTarget, setEditTarget] = useState<PositiveReleaseRecord | null>(null);
  const [editForm, setEditForm] = useState({
    carton: '',
    loose_pcs: '',
    all_parameters_in_control: 'yes' as 'yes' | 'no',
    remarks: '',
  });

  const [opts, setOpts] = useState<{ products: any[]; batches: any[]; batchRecords: any[] }>({
    products: [],
    batches: [],
    batchRecords: [],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [relData, prodsRes, bats, batchRecRes] = await Promise.all([
        loadQaSection('positive_releases', DEFAULT_POSITIVE_RELEASES),
        supabase.from('products').select('*').neq('deleted', true).order('product_code'),
        loadBatchOptions(),
        supabase
          .from('batch_records')
          .select('batch_number, product_code, product_name, production_date, expiry_date, pcs_per_carton, quantity_cartons, carton_barcode')
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      setReleases(Array.isArray(relData) ? relData : []);
      setOpts({
        products: prodsRes.data || [],
        batches: bats,
        batchRecords: batchRecRes.data || [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const persistReleases = async (next: PositiveReleaseRecord[]) => {
    setReleases(next);
    try {
      await saveQaSection('positive_releases', next);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync positive release records.');
    }
  };

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
    const resolvedBarcode =
      res.data.gtin || matchedProd?.carton_barcode || matchedProd?.barcode || matchedBatch?.carton_barcode || '';

    setDecodedSummary({
      batch_number: res.data.batch_number,
      barcode: resolvedBarcode,
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
      barcode: resolvedBarcode || prev.barcode,
      pcs_per_carton: String(resolvedPcsPerCarton),
    }));

    toast.success(resolvedName ? `${resolvedName} (${resolvedCode})` : res.data.batch_number);
  };

  useHardwareScanner((val) => {
    setQrInput(val);
    handleQrDecode(val);
  }, true);

  const inControl = scanForm.all_parameters_in_control === 'yes';

  const handleConfirmRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanForm.item_code || !scanForm.batch_number || !scanForm.expiry_date) {
      return toast.error('Item code, batch number, and expiry date are required.');
    }
    if (!inControl && !scanForm.remarks.trim()) {
      return toast.error('Please add a remark when parameters are not in control.');
    }
    const cartonNum = Number(scanForm.carton) || 0;
    const pcsPerCartonNum = Number(scanForm.pcs_per_carton) || 24;
    const loosePcsNum = Number(scanForm.loose_pcs) || 0;
    const totalQty = cartonNum * pcsPerCartonNum + loosePcsNum;
    if (totalQty <= 0) {
      return toast.error('Enter cartons or loose pcs.');
    }

    const nowIso = new Date().toISOString();
    const record: PositiveReleaseRecord = {
      id: `pr-${Date.now()}`,
      item_code: scanForm.item_code.trim(),
      item_name: scanForm.item_name.trim(),
      batch_number: scanForm.batch_number.trim().toUpperCase(),
      production_date: scanForm.production_date || '',
      expiry_date: scanForm.expiry_date,
      barcode: scanForm.barcode || '',
      all_parameters_in_control: inControl,
      remarks: scanForm.remarks.trim(),
      carton: cartonNum,
      pcs_per_carton: pcsPerCartonNum,
      loose_pcs: loosePcsNum,
      quantity: totalQty,
      status: inControl ? 'Released' : 'Not In Control',
      released_by: actingUserName(user) || user?.name || user?.email || 'QA/QC',
      released_at: nowIso,
    };

    await persistReleases([record, ...releases]);

    try {
      await base44.entities.AuditLog.create({
        event_time: nowIso,
        event_stamp: eventStamp(),
        user_name: record.released_by,
        module: 'Product Positive Release',
        action: inControl ? 'Released' : 'Flagged (Not In Control)',
        record_id: record.id,
        details: `${record.item_name || record.item_code} · Batch ${record.batch_number} · ${formatQtyBreakdown(totalQty, pcsPerCartonNum)}${record.remarks ? ` · Remarks: ${record.remarks}` : ''}`,
        old_value: '',
        new_value: record.status,
      });
    } catch {
      // Non-blocking audit log
    }

    toast.success(
      inControl
        ? `Confirmed positive release: ${formatQtyBreakdown(totalQty, pcsPerCartonNum)}`
        : `Recorded with deviation (Not In Control): ${formatQtyBreakdown(totalQty, pcsPerCartonNum)}`
    );
    setQrInput('');
    setDecodedSummary(null);
    setScanForm(EMPTY_SCAN_FORM);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const editInControl = editForm.all_parameters_in_control === 'yes';
    if (!editInControl && !editForm.remarks.trim()) {
      return toast.error('Remark is required when parameters are not in control.');
    }
    const pcsPerCtn = Number(editTarget.pcs_per_carton) || 24;
    const nextCtn = Number(editForm.carton) || 0;
    const nextLoose = Number(editForm.loose_pcs) || 0;
    const nextQty = nextCtn * pcsPerCtn + nextLoose;
    if (nextQty <= 0) {
      return toast.error('Enter cartons or loose pcs.');
    }

    const updated = releases.map((r) =>
      r.id === editTarget.id
        ? {
            ...r,
            carton: nextCtn,
            loose_pcs: nextLoose,
            quantity: nextQty,
            all_parameters_in_control: editInControl,
            status: (editInControl ? 'Released' : 'Not In Control') as 'Released' | 'Not In Control',
            remarks: editForm.remarks.trim(),
          }
        : r
    );
    await persistReleases(updated);
    toast.success(`Updated ${editTarget.batch_number}`);
    setEditTarget(null);
  };

  const handleDelete = async (item: PositiveReleaseRecord) => {
    if (!window.confirm(`Delete positive release record "${item.item_name || item.item_code}" (${item.batch_number})?`)) {
      return;
    }
    await persistReleases(releases.filter((r) => r.id !== item.id));
    toast.success('Record deleted.');
  };

  const filteredReleases = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return releases;
    return releases.filter((r) =>
      [r.item_name, r.item_code, r.batch_number, r.remarks, r.released_by, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [releases, searchTerm]);

  const previewTotalQty =
    (Number(scanForm.carton) || 0) * (Number(scanForm.pcs_per_carton) || 24) + (Number(scanForm.loose_pcs) || 0);

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Product Positive Release</h2>
          <p className="text-xs text-slate-500">
            Scan carton QR → verify all parameters in control → enter quantity → confirm release
          </p>
        </div>
        <Button
          variant="outline"
          className="bg-white border-[#E2E8F0] text-[#0F294A]"
          onClick={() =>
            exportToXlsx(
              `product_positive_release_${new Date().toISOString().slice(0, 10)}.xlsx`,
              'Positive Release',
              releases.map((r) => ({
                Product: r.item_name,
                Item_Code: r.item_code,
                Batch_Number: r.batch_number,
                Production_Date: r.production_date,
                Expiry_Date: r.expiry_date,
                Barcode: r.barcode,
                Parameters_In_Control: r.all_parameters_in_control ? 'Yes' : 'No',
                Status: r.status,
                Remarks: r.remarks,
                Cartons: r.carton,
                Pcs_Per_Carton: r.pcs_per_carton,
                Loose_Pcs: r.loose_pcs,
                Total_Pcs: r.quantity,
                Released_By: r.released_by,
                Released_At: r.released_at,
              }))
            )
          }
        >
          <Download className="w-4 h-4 mr-1.5" /> Export
        </Button>
      </div>

      {/* Step 1-4: Scan QR & Confirm Positive Release */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan Carton QR &amp; Release Check</CardTitle>
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
            <Button type="button" variant="secondary" onClick={() => handleQrDecode(qrInput)}>
              Decode
            </Button>
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
                <span>
                  {decodedSummary.production_date ? `${fmtDay(decodedSummary.production_date)} → ` : ''}
                  {decodedSummary.expiry_date ? fmtDay(decodedSummary.expiry_date) : '—'}
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleConfirmRelease} className="space-y-4">
            {/* Auto-filled QR Product & Batch fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <SearchableSelect
                value={scanForm.item_code}
                onValueChange={(v) => {
                  const match = opts.products.find((p) => p.product_code === v);
                  setScanForm({
                    ...scanForm,
                    item_code: v,
                    ...(match
                      ? {
                          item_name: match.product_name,
                          pcs_per_carton: String(Number(match.carton_size) || scanForm.pcs_per_carton),
                          barcode: match.carton_barcode || match.barcode || scanForm.barcode,
                        }
                      : {}),
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
                    ...(match
                      ? {
                          item_code: match.product_code,
                          pcs_per_carton: String(Number(match.carton_size) || scanForm.pcs_per_carton),
                          barcode: match.carton_barcode || match.barcode || scanForm.barcode,
                        }
                      : {}),
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
                    ...(bMatch
                      ? {
                          item_code: bMatch.product_code || pMatch?.product_code || scanForm.item_code,
                          item_name: bMatch.product_name || pMatch?.product_name || scanForm.item_name,
                          production_date: bMatch.production_date ? String(bMatch.production_date).slice(0, 10) : scanForm.production_date,
                          expiry_date: bMatch.expiry_date ? String(bMatch.expiry_date).slice(0, 10) : scanForm.expiry_date,
                          barcode: bMatch.carton_barcode || pMatch?.carton_barcode || scanForm.barcode,
                          pcs_per_carton: String(Number(bMatch.pcs_per_carton) || Number(pMatch?.carton_size) || scanForm.pcs_per_carton),
                          carton: scanForm.carton || (bMatch.quantity_cartons ? String(bMatch.quantity_cartons) : ''),
                        }
                      : {}),
                  });
                }}
                options={opts.batches}
                placeholder="Batch #"
                searchPlaceholder="Search batch..."
                allowCustom
              />
              <Input
                type="date"
                value={scanForm.expiry_date}
                onChange={(e) => setScanForm({ ...scanForm, expiry_date: e.target.value })}
                title="Expiry Date"
              />
            </div>

            {/* Step 2: Parameter Control Check + Remarks */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-[#0F294A]">
                  All parameters in control?
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScanForm({ ...scanForm, all_parameters_in_control: 'yes' })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      inControl
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Yes — In Control
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanForm({ ...scanForm, all_parameters_in_control: 'no' })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      !inControl
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> No — Not In Control
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className={`text-xs font-medium ${!inControl ? 'text-rose-600' : 'text-slate-600'}`}>
                  {!inControl ? 'Remarks (required — specify out-of-control parameter) *' : 'Remarks (optional)'}
                </label>
                <Input
                  value={scanForm.remarks}
                  onChange={(e) => setScanForm({ ...scanForm, remarks: e.target.value })}
                  placeholder={
                    !inControl
                      ? 'Describe which parameter is not in control and action taken...'
                      : 'Optional positive release remarks...'
                  }
                  className={!inControl ? 'border-rose-300 bg-white focus-visible:ring-rose-400' : 'bg-white'}
                />
              </div>
            </div>

            {/* Step 3: Quantity (Cartons & Loose Pcs) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
              <Input
                type="number"
                min={0}
                placeholder="Cartons"
                value={scanForm.carton}
                onChange={(e) => setScanForm({ ...scanForm, carton: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                placeholder="Pcs / Carton"
                value={scanForm.pcs_per_carton}
                onChange={(e) => setScanForm({ ...scanForm, pcs_per_carton: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                placeholder="Loose Pcs"
                value={scanForm.loose_pcs}
                onChange={(e) => setScanForm({ ...scanForm, loose_pcs: e.target.value })}
              />
              <div className="text-xs text-slate-600 bg-slate-100 rounded-md px-3 py-2 font-mono">
                Total:{' '}
                <span className="font-semibold text-[#0F294A]">
                  {previewTotalQty > 0
                    ? formatQtyBreakdown(previewTotalQty, Number(scanForm.pcs_per_carton) || 24)
                    : '0 pcs'}
                </span>
              </div>
            </div>

            {/* Step 4: Confirm button */}
            <Button
              type="submit"
              className={`w-full font-semibold text-white ${
                inControl ? 'bg-[#0F294A] hover:bg-[#193B68]' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              Confirm
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Positive Release Records Table */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Positive Release Records ({filteredReleases.length})</CardTitle>
          <Input
            placeholder="Search product, batch, remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 h-8 text-xs"
          />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-xs text-slate-500">
              <tr>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Item Code</th>
                <th className="text-left p-3">Batch #</th>
                <th className="text-left p-3">Expiry</th>
                <th className="text-left p-3">Parameters</th>
                <th className="text-left p-3">Remarks</th>
                <th className="text-right p-3">Quantity</th>
                <th className="text-left p-3">Confirmed By</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500">
                    Loading records...
                  </td>
                </tr>
              ) : filteredReleases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500">
                    No positive release records yet. Scan a carton QR code above to begin.
                  </td>
                </tr>
              ) : (
                filteredReleases.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-[#0F294A]">{item.item_name || '—'}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{item.item_code}</td>
                    <td className="p-3 font-mono font-semibold text-[#1D4ED8]">{item.batch_number}</td>
                    <td className="p-3 text-slate-600">{item.expiry_date ? fmtDay(item.expiry_date) : '—'}</td>
                    <td className="p-3">
                      {item.all_parameters_in_control ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                          In Control
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-100">
                          Not In Control
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-600 max-w-[240px]">{item.remarks || '—'}</td>
                    <td className="p-3 text-right font-mono font-medium whitespace-nowrap">
                      {formatQtyBreakdown(Number(item.quantity) || 0, Number(item.pcs_per_carton) || 24)}
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      <div className="font-medium text-slate-700">{item.released_by || '—'}</div>
                      <div>{item.released_at ? fmtDay(item.released_at) : ''}</div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:text-[#1D4ED8]"
                          onClick={() => {
                            setEditTarget(item);
                            setEditForm({
                              carton: String(item.carton ?? 0),
                              loose_pcs: String(item.loose_pcs ?? 0),
                              all_parameters_in_control: item.all_parameters_in_control ? 'yes' : 'no',
                              remarks: item.remarks || '',
                            });
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-500 hover:text-rose-700"
                          onClick={() => handleDelete(item)}
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

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit · {editTarget?.batch_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 text-sm">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">All parameters in control?</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, all_parameters_in_control: 'yes' })}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold border ${
                    editForm.all_parameters_in_control === 'yes'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  Yes — In Control
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, all_parameters_in_control: 'no' })}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold border ${
                    editForm.all_parameters_in_control === 'no'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  No — Not In Control
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">
                Remarks {editForm.all_parameters_in_control === 'no' ? '*' : ''}
              </label>
              <Input
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                placeholder="Remarks"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Cartons</label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.carton}
                  onChange={(e) => setEditForm({ ...editForm, carton: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Loose Pcs</label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.loose_pcs}
                  onChange={(e) => setEditForm({ ...editForm, loose_pcs: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditTarget(null)}
              className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
