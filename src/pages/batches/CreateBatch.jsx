import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ArrowLeft, Barcode, Box, Download, LayoutGrid, Printer, QrCode, Save, Settings } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ProductPicker from "@/components/labels/ProductPicker";
import LabelPrintSheet from "@/components/labels/LabelPrintSheet";
import LabelSettingsDialog from "@/components/labels/LabelSettingsDialog";
import { loadProducts, num } from "@/lib/planning";
import { labelBlock } from "@/lib/productMaster";
import { actingUserName, isAdminUser } from "@/lib/permissions";
import {
  DEFAULT_LAYOUTS,
  barcodeImageUrl,
  batchQrPayload,
  canEditLabelSettings,
  duplicateOf,
  expiryFor,
  fmtDay,
  loadBatchRecords,
  loadLabelSettings,
  logLabelAudit,
  normalizeBatch,
  qrImageUrl,
  resolveLayout,
  shelfLifeMonthsFromDays,
  traceUrlFor,
} from "@/lib/labels";
import { inputClass, subtleButton, panelClass } from "@/components/planning/styles";

const EMPTY_SETTINGS = { id: "", layouts: [], default_layout_id: "qr13_l" };

export default function CreateBatch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const admin = isAdminUser(user);

  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [productId, setProductId] = useState("");
  const [alphabetSuffix, setAlphabetSuffix] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [manualBatch, setManualBatch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [layoutId, setLayoutId] = useState("qr13_l");
  const [custom, setCustom] = useState({ width_mm: 70, height_mm: 50, font_size: 7, qr_mm: 14, qr_ecc: "M" });
  const [copies] = useState(1);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [savedPrintView, setSavedPrintView] = useState(null);
  const [retailTemplate, setRetailTemplate] = useState(true);
  const [retailStickerLayout, setRetailStickerLayout] = useState(false);

  const reload = useCallback(async () => {
    const [productRows, recordRows, labelSettings] = await Promise.all([
      loadProducts(),
      loadBatchRecords(),
      loadLabelSettings(),
    ]);
    setProducts(productRows.filter((p) => p.active !== false && !p.hidden));
    setRecords(recordRows);
    setSettings(labelSettings);
    setLayoutId((prev) => prev || labelSettings.default_layout_id || "qr13_l");
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const product = products.find((p) => p.id === productId) || null;

  const selectProduct = (next) => {
    setProductId(next?.id || "");
    setManualBatch("");
    if (next?.default_label_layout) {
      setLayoutId(next.default_label_layout);
    }
  };

  // Auto-generate Batch Number once Product and Production Date are chosen: PREFIX + DDMMYY + Alphabet Suffix (e.g. MCL200626T)
  const batchPrefix = useMemo(() => {
    if (!product) return "";
    if (product.batch_prefix) return String(product.batch_prefix).trim().toUpperCase();
    const code = String(product.product_code || product.product_name || "").replace(/[^A-Za-z]/g, "");
    return code.slice(0, 3).toUpperCase() || "BCH";
  }, [product]);

  const datePart = useMemo(() => {
    if (!productionDate || !/^\d{4}-\d{2}-\d{2}$/.test(productionDate)) return "";
    const [yyyy, mm, dd] = productionDate.split("-");
    return `${dd}${mm}${yyyy.slice(2)}`;
  }, [productionDate]);

  const cleanSuffix = alphabetSuffix.replace(/[^A-Za-z]/g, "").toUpperCase();
  const autoBatchNumber = product && datePart ? `${batchPrefix}${datePart}${cleanSuffix}` : "";
  const batchNumber = manualBatch.trim() ? manualBatch.trim().toUpperCase() : autoBatchNumber;

  const shelfMonths = useMemo(() => {
    if (!product) return 0;
    if (num(product.shelf_life_months) > 0) return num(product.shelf_life_months);
    return shelfLifeMonthsFromDays(product.shelf_life_days);
  }, [product]);

  const effectiveShelfDays = useMemo(() => {
    if (!product) return 0;
    if (shelfMonths > 0) return shelfMonths * 30;
    return num(product.shelf_life_days);
  }, [product, shelfMonths]);

  const computedExpiry = expiryFor(productionDate, effectiveShelfDays);
  const expiryDate = overrideOpen && overrideDate ? overrideDate : computedExpiry;
  const duplicate =
    duplicateOf(records, productId, batchNumber) ||
    (batchNumber ? records.find((r) => normalizeBatch(r.batch_number) === normalizeBatch(batchNumber)) : null);

  const layoutList = settings?.layouts?.length ? settings.layouts : DEFAULT_LAYOUTS;
  const baseLayout = resolveLayout(settings, layoutId);
  const layout =
    layoutId === "custom"
      ? {
          ...baseLayout,
          id: "custom",
          name: "Custom (Manual)",
          width_mm: num(custom.width_mm) || 70,
          height_mm: num(custom.height_mm) || 50,
          font_size: num(custom.font_size) || 7,
          qr_mm: num(custom.qr_mm) || 14,
          qr_ecc: custom.qr_ecc || "M",
        }
      : baseLayout;

  const pcsPerCarton = num(product?.carton_size) || num(product?.pcs_per_carton) || 24;
  const cartonBarcode = product?.carton_barcode || product?.barcode || "";

  const labelData = {
    productName: product?.product_name || "",
    productCode: product?.product_code || "",
    batchNumber,
    productionDate,
    expiryDate,
    cartonBarcode,
    pcsPerCarton,
  };

  const saveAndPrint = async () => {
    const batch = normalizeBatch(batchNumber);
    if (!product) return toast({ title: "Pick a product", description: "The batch must belong to a product.", variant: "destructive" });
    const blocked = labelBlock(product);
    if (blocked) return toast({ title: "Product cannot be labelled", description: `${product.product_name}: ${blocked}. Fix it in Product Master.`, variant: "destructive" });
    if (!cleanSuffix) return toast({ title: "Alphabet suffix required", description: "Enter an Alphabet Suffix (e.g. A or T) to complete the batch number.", variant: "destructive" });
    if (!batch) return toast({ title: "Batch number missing", description: "Choose a product and production date.", variant: "destructive" });
    if (duplicate) return toast({ title: "Duplicate batch number", description: `${batch} is already recorded for ${product.product_name}.`, variant: "destructive" });
    if (!expiryDate) return toast({ title: "Expiry date missing", description: "Set the product shelf life, or override the expiry date.", variant: "destructive" });
    if (overrideOpen && !overrideReason.trim()) return toast({ title: "Reason required", description: "Give a reason for overriding the expiry date.", variant: "destructive" });

    setSaving(true);
    try {
      const count = Math.max(1, Math.round(num(copies) || 1));
      const payload = {
        product_id: product.id,
        product_code: product.product_code || "",
        product_name: product.product_name || "",
        batch_number: batch,
        production_date: productionDate,
        expiry_date: expiryDate,
        shelf_life_days: effectiveShelfDays,
        expiry_overridden: overrideOpen,
        expiry_override_reason: overrideOpen ? overrideReason.trim() : "",
        expiry_override_by: overrideOpen ? actingUserName(user) : "",
        quantity_cartons: num(quantity),
        pcs_per_carton: pcsPerCarton,
        carton_barcode: cartonBarcode || batch,
        status: "Active",
        label_layout: layout.id,
        label_layout_name: layout.name,
        label_width_mm: layout.width_mm,
        label_height_mm: layout.height_mm,
        label_font_size: layout.font_size,
        qr_mm: layout.qr_mm,
        qr_ecc: layout.qr_ecc,
        trace_url: traceUrlFor(batch),
        created_by_name: actingUserName(user),
        created_by_id: user?.id || "",
        print_count: count,
        reprints: [],
      };
      const created = await base44.entities.BatchRecord.create(payload);
      await logLabelAudit({
        user,
        action: "Created",
        recordId: created?.id || "",
        details: `Batch ${batch} for ${product.product_name} · ${count} label(s) printed`,
      });
      setRecords((list) => [created || payload, ...list]);

      const printData = {
        ...labelData,
        batchNumber: batch,
        cartonBarcode: cartonBarcode || batch,
        pcsPerCarton,
      };
      setSavedPrintView({ layout, copies: count, data: printData });
      toast({
        title: "Batch saved to Batch Records",
        description: `${batch} · ready to print.`,
      });
      setAlphabetSuffix("");
      setProductionDate("");
      setManualBatch("");
      setQuantity("");
      setOverrideOpen(false);
      setOverrideDate("");
      setOverrideReason("");
    } catch (e) {
      toast({ title: "Could not save the batch", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const generatePdf = async () => {
    const el = document.getElementById("saved-label-card");
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [150, 100] });
    pdf.addImage(imgData, "PNG", 5, 5, 60, 40);
    pdf.save(`${savedPrintView?.data?.batchNumber || "batch-label"}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
      </div>
    );
  }

  // Post-save view (Matches Picture 8)
  if (savedPrintView) {
    const d = savedPrintView.data;
    const activeLayout = savedPrintView.layout;
    const eccPct = activeLayout.qr_ecc === "L" ? "7%" : activeLayout.qr_ecc === "Q" ? "25%" : activeLayout.qr_ecc === "H" ? "30%" : "15%";
    return (
      <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              to="/batch-records"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F294A] hover:bg-[#F1F5F9]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Batches
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setSavedPrintView(null)} className="text-xs text-[#64748B]">
              Create Another
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={generatePdf} className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">
              <Download className="w-4 h-4 mr-1.5" /> Generate PDF
            </Button>
            <Button onClick={() => setJob({ ...savedPrintView })} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold">
              <Printer className="w-4 h-4 mr-1.5" /> Print Now
            </Button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Center Label Preview Card */}
          <div className="flex justify-center">
            <div
              id="saved-label-card"
              data-logo-badge="true"
              style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
              className="rounded-xl border border-slate-200 p-5 shadow-md w-[380px] space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 text-xs" style={{ color: "#0f172a" }}>
                  <p className="font-bold text-sm leading-tight uppercase" style={{ color: "#0f172a" }}>
                    {d.productName}
                  </p>
                  <p className="font-semibold" style={{ color: "#1e293b" }}>
                    {d.productCode}
                  </p>
                  <p className="font-bold" style={{ color: "#0f172a" }}>
                    {d.batchNumber}
                  </p>
                  <p style={{ color: "#475569" }}>Exp: {fmtDay(d.expiryDate)}</p>
                  <p style={{ color: "#475569" }}>{d.pcsPerCarton} pcs/carton</p>
                </div>
                <img
                  src={qrImageUrl(batchQrPayload(d), activeLayout.qr_ecc)}
                  alt="QR"
                  className="w-24 h-24 shrink-0"
                />
              </div>
              <div className="pt-2 text-center">
                <img
                  src={barcodeImageUrl(d.cartonBarcode || d.batchNumber)}
                  alt="Barcode"
                  className="w-full h-11 object-contain"
                />
                <p className="text-[11px] font-mono tracking-wider mt-0.5" style={{ color: "#334155" }}>
                  {d.cartonBarcode || d.batchNumber}
                </p>
              </div>
            </div>
          </div>

          {/* Print Settings Card (Matches Picture 8) */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0F294A]">
              <Printer className="w-4 h-4 text-[#2563EB]" />
              <span>Print Settings</span>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#64748B]">Label Template</p>
              <div className="rounded-lg bg-[#2563EB] text-white px-4 py-2.5">
                <p className="text-xs font-semibold">60 × 40 mm</p>
                <p className="text-[11px] text-blue-100 mt-0.5">
                  60 × 40 mm label rotated to 90° in top-left corner of 100 × 150 mm (landscape) page
                </p>
              </div>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <Checkbox
                  checked={retailTemplate}
                  onCheckedChange={(c) => setRetailTemplate(c === true)}
                  className="mt-0.5 data-[state=checked]:bg-[#2563EB] data-[state=checked]:border-[#2563EB]"
                />
                <div>
                  <p className="text-xs font-semibold text-[#0F294A]">Retail EAN-13 + QR Batch Template</p>
                  <p className="text-[11px] text-[#64748B]">
                    Barcode shows only the batch number as EAN-13; the QR carries the batch number and full batch details.
                  </p>
                </div>
              </label>
            </div>

            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Label Layout
              </p>
              <div className="rounded-lg bg-[#2563EB] text-white px-4 py-2.5">
                <p className="text-xs font-semibold">{activeLayout.name}</p>
                <p className="text-[11px] text-blue-100 mt-0.5">
                  {activeLayout.qr_mm}×{activeLayout.qr_mm}mm QR with error correction {activeLayout.qr_ecc} ({eccPct}) — larger QR modules
                </p>
              </div>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <Checkbox
                  checked={retailStickerLayout}
                  onCheckedChange={(c) => setRetailStickerLayout(c === true)}
                  className="mt-0.5 data-[state=checked]:bg-[#2563EB] data-[state=checked]:border-[#2563EB]"
                />
                <div>
                  <p className="text-xs font-semibold text-[#0F294A]">Retail EAN-13 + QR Batch Layout (60mm × 40mm)</p>
                  <p className="text-[11px] text-[#64748B]">
                    60 × 40 mm sticker: QR at the top, EAN-13 batch-number barcode below, batch number beside the barcode.
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-2 border-t border-[#E2E8F0] text-center space-y-1 text-[11px] text-[#64748B]">
              <p>
                Exported at 300 DPI. In the print dialog choose <strong className="text-[#0F294A]">Actual size</strong> / scale 100% and turn off &ldquo;Fit to Page&rdquo;.
              </p>
              <p>
                Active: <strong className="text-[#0F294A]">60 × 40 mm</strong> — 60 × 40 mm label rotated to 90° in top-left corner of 100 × 150 mm (landscape) page
              </p>
            </div>
          </div>
        </div>
        <LabelPrintSheet job={job} />
      </div>
    );
  }

  const eccPct = layout.qr_ecc === "L" ? "7%" : layout.qr_ecc === "Q" ? "25%" : layout.qr_ecc === "H" ? "30%" : "15%";

  // Main Create Batch Form (Matches Picture 7)
  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Create Batch / Labels</h2>
          <p className="text-[#64748B] text-sm mt-1">Record a batch and print its labels with a traceability QR code.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditLabelSettings(user) && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className={subtleButton}>
              <Settings className="w-4 h-4 mr-1.5" /> Label Settings
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* LEFT CARD: Batch Details Form */}
        <div className={`${panelClass} p-5 space-y-4`}>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F294A]">
              Product <span className="text-rose-500">*</span>
            </label>
            <ProductPicker products={products} value={productId} onChange={selectProduct} />
            {product && labelBlock(product) && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {labelBlock(product)} — labels are blocked until this is fixed in Product Master.
              </p>
            )}
          </div>

          {product && (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-[#64748B]">
                <Barcode className="w-3.5 h-3.5 shrink-0" />
                <span>Carton Barcode:</span>
                <span className="font-mono font-semibold text-[#0F294A]">{cartonBarcode || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-[#64748B]">
                <Box className="w-3.5 h-3.5 shrink-0" />
                <span>Shelf Life:</span>
                <span className="font-semibold text-[#0F294A]">
                  {shelfMonths > 0 ? `${shelfMonths} months` : `${effectiveShelfDays} days`}
                </span>
              </div>
              <div className="text-[#64748B]">
                Item Code: <span className="font-mono font-semibold text-[#0F294A]">{product.product_code || "—"}</span>
              </div>
              <div className="text-[#64748B]">
                Description:{" "}
                <span className="block font-medium text-[#0F294A] mt-0.5">
                  {product.product_name_original || product.product_name || "—"}
                </span>
              </div>
              <div className="text-[#64748B]">
                Batch Prefix: <span className="font-mono font-semibold text-[#0F294A]">{batchPrefix || "—"}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F294A]">
              Batch Number <span className="text-rose-500">*</span>
            </label>
            <Input
              value={batchNumber}
              onChange={(e) => setManualBatch(e.target.value.toUpperCase())}
              placeholder="Enter production date & product, or type batch number"
              className={`${inputClass} bg-[#F8FAFC] font-mono font-semibold text-[#0F294A]`}
            />
            <p className="text-[11px] text-[#64748B]">
              Auto-generated: {batchPrefix || "PREFIX"} + date (DDMMYY) + alphabet
            </p>
            {duplicate && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Already recorded for this product.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F294A]">
              Alphabet Suffix <span className="text-rose-500">*</span>
            </label>
            <Input
              value={alphabetSuffix}
              onChange={(e) => setAlphabetSuffix(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3))}
              placeholder="e.g. A"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0F294A]">
                Production Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0F294A]">Expiry Date</label>
              <Input
                type="text"
                value={expiryDate ? fmtDay(expiryDate) : ""}
                readOnly
                placeholder="dd/mm/yyyy"
                className={`${inputClass} bg-[#F8FAFC]`}
              />
              {admin && (
                <button
                  type="button"
                  onClick={() => {
                    setOverrideOpen((v) => !v);
                    setOverrideDate(overrideOpen ? "" : computedExpiry || productionDate);
                  }}
                  className="text-[11px] text-[#1D4ED8] hover:underline"
                >
                  {overrideOpen ? "Cancel override" : "Admin: override expiry date"}
                </button>
              )}
              {overrideOpen && (
                <div className="space-y-1 pt-1">
                  <Input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className={inputClass} />
                  <Input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for the override (required)"
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F294A]">Quantity Produced (Cartons)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
              placeholder="e.g. 500"
            />
          </div>

          <Button
            onClick={saveAndPrint}
            disabled={saving || !!duplicate}
            className="w-full h-11 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save & Print Labels"}
          </Button>
        </div>

        {/* RIGHT CARD: Label Preview & Label Layout */}
        <div className={`${panelClass} p-5 space-y-5`}>
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F294A]">
              <QrCode className="w-4 h-4 text-[#64748B]" />
              <span>Label Preview</span>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 flex justify-center">
              <div
                data-logo-badge="true"
                style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
                className="rounded-lg border border-slate-200 p-4 shadow-sm w-[280px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 text-[11px] min-w-0">
                    <p className="font-bold text-xs leading-tight truncate" style={{ color: "#0f172a" }}>
                      {product?.product_name || "PRODUCT NAME"}
                    </p>
                    <p className="font-bold" style={{ color: "#0f172a" }}>
                      {product?.product_code || "ITEM-CODE"}
                    </p>
                    <p className="font-semibold" style={{ color: "#1e293b" }}>
                      {batchNumber || "BATCH-NO"}
                    </p>
                    <p className="text-[10px]" style={{ color: "#475569" }}>
                      Exp: {fmtDay(expiryDate)}
                    </p>
                  </div>
                  <img
                    src={qrImageUrl(batchQrPayload(labelData), layout.qr_ecc)}
                    alt="QR Preview"
                    className="w-16 h-16 shrink-0"
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] font-mono text-[#64748B] break-all">
              {[
                batchNumber || "BATCH-NO",
                product?.product_name || "PRODUCT",
                product?.product_code || "CODE",
                expiryDate || "YYYY-MM-DD",
              ].join(" | ")}
            </p>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F294A]">
              <LayoutGrid className="w-4 h-4 text-[#64748B]" />
              <span>Label Layout</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {layoutList.map((item) => {
                const active = item.id === layoutId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLayoutId(item.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors ${
                      active
                        ? "bg-[#2563EB] border-[#2563EB] text-white font-semibold shadow-sm"
                        : "bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>

            {layoutId === "custom" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div>
                  <label className="text-[10px] text-[#64748B]">Width (mm)</label>
                  <Input
                    type="number"
                    value={custom.width_mm}
                    onChange={(e) => setCustom({ ...custom, width_mm: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#64748B]">Height (mm)</label>
                  <Input
                    type="number"
                    value={custom.height_mm}
                    onChange={(e) => setCustom({ ...custom, height_mm: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#64748B]">Font (pt)</label>
                  <Input
                    type="number"
                    value={custom.font_size}
                    onChange={(e) => setCustom({ ...custom, font_size: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#64748B]">QR (mm)</label>
                  <Input
                    type="number"
                    value={custom.qr_mm}
                    onChange={(e) => setCustom({ ...custom, qr_mm: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#64748B]">
              {layout.qr_mm}×{layout.qr_mm}mm QR with error correction {layout.qr_ecc} ({eccPct}) — larger QR modules
            </p>
          </div>
        </div>
      </div>

      <LabelSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        user={user}
        onSaved={reload}
      />

      <LabelPrintSheet job={job} />
    </div>
  );
}
