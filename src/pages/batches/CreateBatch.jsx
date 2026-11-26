import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowLeft, Barcode, Box, Download, History, LayoutGrid, Printer, QrCode, Save, Settings, Tag } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ProductPicker from "@/components/labels/ProductPicker";
import LabelPrintSheet from "@/components/labels/LabelPrintSheet";
import LabelSettingsDialog from "@/components/labels/LabelSettingsDialog";
import LockedLabelCard from "@/components/labels/LockedLabelCard";
import BatchRecords from "@/pages/batches/BatchRecords";
import { loadProducts, num } from "@/lib/planning";
import { isPapadamProduct, labelBlock } from "@/lib/productMaster";
import { actingUserName, isAdminUser } from "@/lib/permissions";
import {
  DEFAULT_LAYOUTS,
  LOCKED_PRINT_TEMPLATE,
  barcodeImageUrl,
  batchQrPayload,
  buildTemplatePageCanvas,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "records" ? "records" : "generate";
  const admin = isAdminUser(user);

  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsVersion, setRecordsVersion] = useState(0);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [productId, setProductId] = useState("");
  const [alphabetSuffix, setAlphabetSuffix] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [manualBatch, setManualBatch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [custom, setCustom] = useState({ width_mm: 70, height_mm: 50, font_size: 7, qr_mm: 14, qr_ecc: "M" });
  const [copies] = useState(1);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [savedPrintView, setSavedPrintView] = useState(null);

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

  const onTabChange = (next) => {
    if (next === "records") {
      setSearchParams({ tab: "records" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const product = products.find((p) => p.id === productId) || null;
  const isPapadam = useMemo(() => isPapadamProduct(product), [product]);

  const selectProduct = (next) => {
    setProductId(next?.id || "");
    setManualBatch("");
    setAlphabetSuffix("");
    if (next?.default_label_layout) {
      setLayoutId(next.default_label_layout);
    }
  };

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
  const batchNumber = isPapadam ? manualBatch.trim().toUpperCase() : autoBatchNumber;

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

  const computedExpiry = expiryFor(productionDate, num(product?.shelf_life_days), shelfMonths);
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
  const cartonBarcode = String(product?.carton_barcode || product?.barcode || "").replace(/^\*+/, "").trim();
  const productDisplayName = String(product?.recipe_name || product?.product_name || "").trim();
  const cartonDescription = String(
    product?.carton_skus?.[0]?.description || product?.product_name_original || product?.product_name || ""
  ).trim();

  const labelData = {
    productName: productDisplayName,
    cartonDescription,
    productCode: product?.product_code || "",
    batchNumber,
    productionDate,
    expiryDate,
    cartonBarcode,
    pcsPerCarton,
  };

  const saveAndPrint = async () => {
    const batch = normalizeBatch(batchNumber);
    if (!product) return toast({ title: "Pick a product", variant: "destructive" });
    const blocked = labelBlock(product);
    if (blocked) return toast({ title: "Product blocked", description: blocked, variant: "destructive" });
    if (!productionDate) return toast({ title: "Production date required", variant: "destructive" });
    if (isPapadam) {
      if (!batch) return toast({ title: "Batch number required", variant: "destructive" });
    } else {
      if (!cleanSuffix) return toast({ title: "Alphabet suffix required", variant: "destructive" });
      if (!batch) return toast({ title: "Batch number missing", variant: "destructive" });
    }
    if (duplicate) return toast({ title: "Duplicate batch", description: `${batch} already exists.`, variant: "destructive" });
    if (!expiryDate) return toast({ title: "Expiry date missing", variant: "destructive" });
    if (overrideOpen && !overrideReason.trim()) return toast({ title: "Override reason required", variant: "destructive" });

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
        carton_description: cartonDescription,
        qr_payload: batchQrPayload({
          cartonBarcode: cartonBarcode || batch,
          productName: productDisplayName,
          cartonDescription,
          productCode: product.product_code || "",
          batchNumber: batch,
          expiryDate,
        }),
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
        details: `Batch ${batch} for ${product.product_name} · ${count} label(s)`,
      });
      setRecords((list) => [created || payload, ...list]);
      setRecordsVersion((v) => v + 1);

      const printData = {
        ...labelData,
        batchNumber: batch,
        cartonBarcode: cartonBarcode || batch,
        pcsPerCarton,
      };
      setSavedPrintView({ layout, copies: count, data: printData });
      toast({ title: "Batch saved", description: `${batch} ready to print.` });
      setAlphabetSuffix("");
      setProductionDate("");
      setManualBatch("");
      setQuantity("");
      setOverrideOpen(false);
      setOverrideDate("");
      setOverrideReason("");
    } catch (e) {
      toast({ title: "Could not save batch", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const renderLockedPageImage = async () => {
    const el = document.getElementById("saved-label-card");
    if (!el) return null;
    const labelCanvas = await html2canvas(el, {
      scale: 4,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
    });
    const pageCanvas = buildTemplatePageCanvas(labelCanvas, LOCKED_PRINT_TEMPLATE);
    return pageCanvas.toDataURL("image/png");
  };

  const generatePdf = async () => {
    try {
      const pageImgData = await renderLockedPageImage();
      if (!pageImgData) return;
      const { pageW, pageH } = LOCKED_PRINT_TEMPLATE;
      const orientation = pageW >= pageH ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "mm", format: [pageW, pageH] });
      pdf.addImage(pageImgData, "PNG", 0, 0, pageW, pageH, undefined, "NONE");
      pdf.save(`${savedPrintView?.data?.batchNumber || "batch-label"}.pdf`);
    } catch (err) {
      toast({ title: "PDF failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handlePrintNow = async () => {
    try {
      const pageImgData = await renderLockedPageImage();
      if (!pageImgData) return;
      const { pageW, pageH } = LOCKED_PRINT_TEMPLATE;
      setJob({
        pageImageUrl: pageImgData,
        pageWidthMm: pageW,
        pageHeightMm: pageH,
        copies: savedPrintView?.copies || 1,
      });
    } catch (err) {
      toast({ title: "Print failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
      </div>
    );
  }

  if (savedPrintView) {
    const d = savedPrintView.data;
    const activeLayout = savedPrintView.layout;
    return (
      <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-6">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSavedPrintView(null);
                onTabChange("records");
              }}
              className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9] text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Batch Records
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSavedPrintView(null)} className="text-xs text-[#64748B]">
              New Label
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={generatePdf} className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">
              <Download className="w-4 h-4 mr-1.5" /> PDF
            </Button>
            <Button onClick={handlePrintNow} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold">
              <Printer className="w-4 h-4 mr-1.5" /> Print
            </Button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto flex justify-center">
          <LockedLabelCard id="saved-label-card" data={d} qrEcc={activeLayout.qr_ecc} />
        </div>

        <p className="text-center text-xs text-[#64748B]">
          60 × 40 mm · {activeLayout.name} · Print at 100% scale
        </p>

        <LabelPrintSheet job={job} onDone={() => setJob(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[#0F294A] text-xl font-bold tracking-tight">Label Generator</h2>
        {activeTab === "generate" && canEditLabelSettings(user) && (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className={subtleButton}>
            <Settings className="w-4 h-4 mr-1.5" /> Settings
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full space-y-4">
        <TabsList className="bg-[#F1F5F9] border border-[#E2E8F0] h-auto p-1 inline-flex gap-1">
          <TabsTrigger
            value="generate"
            className="rounded-full px-4 py-1.5 text-sm text-[#64748B] hover:text-[#0F294A] data-[state=active]:bg-[#0F294A] data-[state=active]:text-white data-[state=active]:font-semibold"
          >
            <Tag className="w-3.5 h-3.5 mr-1.5" /> Generate Label
          </TabsTrigger>
          <TabsTrigger
            value="records"
            className="rounded-full px-4 py-1.5 text-sm text-[#64748B] hover:text-[#0F294A] data-[state=active]:bg-[#0F294A] data-[state=active]:text-white data-[state=active]:font-semibold"
          >
            <History className="w-3.5 h-3.5 mr-1.5" /> Batch Records
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className={`${panelClass} p-5 space-y-4`}>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F294A]">
                  Product <span className="text-rose-500">*</span>
                </label>
                <ProductPicker products={products} value={productId} onChange={selectProduct} />
                {product && labelBlock(product) && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {labelBlock(product)}
                  </p>
                )}
              </div>

              {product && (
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#64748B]">
                    <Barcode className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono font-semibold text-[#0F294A] truncate">{cartonBarcode || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#64748B]">
                    <Box className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-semibold text-[#0F294A]">
                      {shelfMonths > 0 ? `${shelfMonths}m` : `${effectiveShelfDays}d`}
                    </span>
                  </div>
                  <div className="text-[#64748B]">
                    Code: <span className="font-mono font-semibold text-[#0F294A]">{product.product_code || "—"}</span>
                  </div>
                  <div className="text-[#64748B]">
                    Prefix: <span className="font-mono font-semibold text-[#0F294A]">{isPapadam ? "Manual" : batchPrefix || "—"}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F294A]">
                  Batch Number <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={isPapadam ? manualBatch : autoBatchNumber}
                  onChange={(e) => {
                    if (isPapadam) setManualBatch(e.target.value.toUpperCase());
                  }}
                  readOnly={!isPapadam}
                  placeholder={isPapadam ? "Enter batch number" : "Auto-generated"}
                  className={`${inputClass} ${isPapadam ? "bg-white" : "bg-[#F8FAFC] cursor-default"} font-mono font-semibold text-[#0F294A]`}
                />
                {duplicate && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Duplicate batch number.
                  </p>
                )}
              </div>

              {!isPapadam && (
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
              )}

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
                      {overrideOpen ? "Cancel override" : "Override expiry"}
                    </button>
                  )}
                  {overrideOpen && (
                    <div className="space-y-1 pt-1">
                      <Input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className={inputClass} />
                      <Input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Reason"
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F294A]">Quantity (Cartons)</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>

              <Button
                onClick={saveAndPrint}
                disabled={saving || !!duplicate}
                className="w-full h-11 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save & Print"}
              </Button>
            </div>

            <div className={`${panelClass} p-5 space-y-5`}>
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F294A]">
                  <QrCode className="w-4 h-4 text-[#64748B]" />
                  <span>Preview</span>
                </div>

                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 flex justify-center">
                  <div
                    data-logo-badge="true"
                    style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
                    className="rounded-lg border border-slate-200 p-4 shadow-sm w-[300px] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 text-[11px] min-w-0">
                        <p className="font-bold text-xs leading-tight truncate" style={{ color: "#0f172a" }}>
                          {cartonDescription || product?.product_name || "PRODUCT NAME"}
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
                        crossOrigin="anonymous"
                        className="w-16 h-16 shrink-0"
                      />
                    </div>
                    {(cartonBarcode || batchNumber) && (
                      <div className="pt-1 border-t border-slate-100 text-center">
                        <img
                          src={barcodeImageUrl(cartonBarcode || batchNumber)}
                          alt="Carton Barcode Preview"
                          crossOrigin="anonymous"
                          className="w-full h-9 object-contain"
                        />
                        <p className="text-[10px] font-mono tracking-wider mt-0.5" style={{ color: "#334155" }}>
                          {cartonBarcode || batchNumber}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F294A]">
                  <LayoutGrid className="w-4 h-4 text-[#64748B]" />
                  <span>Layout</span>
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
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="records" className="mt-0 focus-visible:outline-none">
          <BatchRecords embedded key={recordsVersion} />
        </TabsContent>
      </Tabs>

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
