import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertTriangle, ArrowLeft, Download, Printer, Settings, Star } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import ProductPicker from "@/components/labels/ProductPicker";
import LayoutPicker from "@/components/labels/LayoutPicker";
import LabelPreview from "@/components/labels/LabelPreview";
import LabelPrintSheet from "@/components/labels/LabelPrintSheet";
import LabelSettingsDialog from "@/components/labels/LabelSettingsDialog";
import { loadProducts, loadRecipes, num } from "@/lib/planning";
import { loadProductionOrderOptions } from "@/lib/masterOptions";
import { recipeOf } from "@/lib/productLinks";
import { labelBlock } from "@/lib/productMaster";
import { fmtQty } from "@/lib/production";
import { actingUserName, isAdminUser } from "@/lib/permissions";
import {
  barcodeImageUrl, batchQrPayload, canEditLabelSettings, duplicateOf, expiryFor, fmtDay, loadBatchRecords, loadLabelSettings, logLabelAudit, normalizeBatch,
  qrImageUrl, resolveLayout, saveDefaultLayoutForProduct, shelfLifeMonthsFromDays, traceUrlFor,
} from "@/lib/labels";
import { recordBatchOnOrder } from "@/lib/batchTrace";
import { inputClass, primaryButton, subtleButton, panelClass, labelClass } from "@/components/planning/styles";

const EMPTY_SETTINGS = { id: "", layouts: [], default_layout_id: "" };

export default function CreateBatch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const admin = isAdminUser(user);

  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [productId, setProductId] = useState("");
  const [alphabetSuffix, setAlphabetSuffix] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [custom, setCustom] = useState({ width_mm: 70, height_mm: 50, font_size: 7, qr_mm: 14, qr_ecc: "M" });
  const [copies, setCopies] = useState(1);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [job, setJob] = useState(null);
  const [savedPrintView, setSavedPrintView] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");

  const reload = useCallback(async () => {
    const [productRows, recordRows, labelSettings, recipeRows, orderRows] = await Promise.all([
      loadProducts(), loadBatchRecords(), loadLabelSettings(), loadRecipes(), loadProductionOrderOptions(),
    ]);
    setProducts(productRows.filter((p) => p.active !== false && !p.hidden));
    setRecipes(recipeRows);
    setRecords(recordRows);
    setOrders(orderRows);
    setSettings(labelSettings);
    setLayoutId((prev) => prev || labelSettings.default_layout_id);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const product = products.find((p) => p.id === productId) || null;
  const recipe = product ? recipeOf(recipes, product) : null;

  const selectProduct = (next) => {
    setProductId(next?.id || "");
    setLayoutId(next?.default_label_layout || settings.default_layout_id);
  };

  const selectedOrder = orders.find((o) => o.order_number === selectedOrderNumber) || null;
  const selectOrder = (orderNumber) => {
    setSelectedOrderNumber(orderNumber);
    const ord = orders.find((o) => o.order_number === orderNumber);
    if (!ord) return;
    const matchedProd = products.find((p) => p.product_code === ord.product_code || p.product_name === ord.product_name);
    if (matchedProd) selectProduct(matchedProd);
    // Auto-fill cartons & next unused alphabet suffix from the order's pre-generated batch_codes
    // (Production Date and Batch Number are entered manually by the user)
    if (ord.batch_cartons && !quantity) {
      setQuantity(String(ord.batch_cartons));
    }
    const existingSet = new Set(records.map((r) => normalizeBatch(r.batch_number)));
    const nextCode = (ord.batch_codes || []).find((c) => !existingSet.has(normalizeBatch(c)));
    if (nextCode) {
      const m = String(nextCode).trim().match(/([A-Za-z]+)$/);
      if (m) setAlphabetSuffix(m[1].toUpperCase());
    }
  };

  // Auto-generate Batch Number: PREFIX + DDMMYY + Alphabet Suffix (e.g. MCL200626T)
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
  const batchNumber = product && datePart ? `${batchPrefix}${datePart}${cleanSuffix}` : "";

  const computedExpiry = expiryFor(productionDate, product?.shelf_life_days);
  const expiryDate = overrideOpen && overrideDate ? overrideDate : computedExpiry;
  const duplicate =
    duplicateOf(records, productId, batchNumber) ||
    (batchNumber ? records.find((r) => normalizeBatch(r.batch_number) === normalizeBatch(batchNumber)) : null);

  const baseLayout = resolveLayout(settings, layoutId);
  const layout = layoutId === "custom"
    ? {
        ...baseLayout,
        id: "custom",
        name: "Custom Manual",
        width_mm: num(custom.width_mm) || 70,
        height_mm: num(custom.height_mm) || 50,
        font_size: num(custom.font_size) || 7,
        qr_mm: num(custom.qr_mm) || 14,
        qr_ecc: custom.qr_ecc || "M",
      }
    : baseLayout;

  const labelData = {
    productName: product?.product_name || "",
    productCode: product?.product_code || "",
    batchNumber,
    productionDate,
    expiryDate,
  };

  const savedLayout = product?.default_label_layout || "";
  const layoutIsDefault = product ? savedLayout === layoutId : false;

  const saveAsDefault = async () => {
    if (!product) return;
    await saveDefaultLayoutForProduct(product.id, layoutId);
    toast({ title: "Layout saved", description: `${layout.name} is now the default for ${product.product_name}.` });
    await reload();
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
      const pcsPerCarton = num(product.carton_size) || num(product.pcs_per_carton) || 24;
      const payload = {
        product_id: product.id,
        product_code: product.product_code || "",
        product_name: product.product_name || "",
        ...(selectedOrder ? { order_id: selectedOrder.id, order_number: selectedOrder.order_number, machine: selectedOrder.machine || "" } : {}),
        batch_number: batch,
        production_date: productionDate,
        expiry_date: expiryDate,
        shelf_life_days: num(product.shelf_life_days),
        expiry_overridden: overrideOpen,
        expiry_override_reason: overrideOpen ? overrideReason.trim() : "",
        expiry_override_by: overrideOpen ? actingUserName(user) : "",
        quantity_cartons: num(quantity),
        pcs_per_carton: pcsPerCarton,
        carton_barcode: product.carton_barcode || product.barcode || batch,
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
      if (selectedOrder) {
        await recordBatchOnOrder({
          order: selectedOrder,
          batchNumber: batch,
          cartons: num(quantity),
          recordId: created?.id || "",
          user,
        }).catch(() => {});
      }
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
        cartonBarcode: product.carton_barcode || product.barcode || batch,
        pcsPerCarton,
      };
      setSavedPrintView({ layout, copies: count, data: printData });
      toast({
        title: "Batch saved to Batch Records",
        description: `${batch} · ready to print ${count} label(s).`,
      });
      setAlphabetSuffix("");
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

  if (savedPrintView) {
    const d = savedPrintView.data;
    return (
      <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/batch-records" className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F294A]">
            <ArrowLeft className="w-4 h-4" /> Back to Batches
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSavedPrintView(null)} className={subtleButton}>
              Create Another Batch
            </Button>
            <Button variant="outline" onClick={generatePdf} className={subtleButton}>
              <Download className="w-4 h-4 mr-1.5" /> Generate PDF
            </Button>
            <Button onClick={() => setJob({ ...savedPrintView })} className={primaryButton}>
              <Printer className="w-4 h-4 mr-1.5" /> Print Now
            </Button>
          </div>
        </div>

        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex justify-center">
            <div id="saved-label-card" data-logo-badge="true" style={{ backgroundColor: "#ffffff", color: "#0f172a" }} className="rounded-lg border border-slate-200 p-4 shadow-lg w-[360px] space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 text-xs" style={{ color: "#0f172a" }}>
                  <p className="font-bold text-sm leading-tight" style={{ color: "#0f172a" }}>{d.productName}</p>
                  <p className="font-medium" style={{ color: "#334155" }}>{d.productCode}</p>
                  <p className="font-bold" style={{ color: "#0f172a" }}>{d.batchNumber}</p>
                  <p style={{ color: "#475569" }}>Exp: {fmtDay(d.expiryDate)}</p>
                  <p style={{ color: "#475569" }}>{d.pcsPerCarton} pcs/carton</p>
                </div>
                <img src={qrImageUrl(batchQrPayload(d), savedPrintView.layout.qr_ecc)} alt="QR" className="w-20 h-20 shrink-0" />
              </div>
              <div className="pt-1 text-center">
                <img src={barcodeImageUrl(d.cartonBarcode || d.batchNumber)} alt="Barcode" className="w-full h-12 object-contain" />
                <p className="text-[11px] font-mono tracking-wider" style={{ color: "#334155" }}>{d.cartonBarcode || d.batchNumber}</p>
              </div>
            </div>
          </div>

          <div className={`${panelClass} p-3 flex items-center justify-between text-xs text-[#64748B]`}>
            <span className="font-semibold text-[#0F294A]">{savedPrintView.layout.name}</span>
            <span>{savedPrintView.layout.width_mm} × {savedPrintView.layout.height_mm} mm · ECC {savedPrintView.layout.qr_ecc}</span>
          </div>
        </div>
        <LabelPrintSheet job={job} />
      </div>
    );
  }

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

      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4 items-start">
        <div className={`${panelClass} p-4 space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {orders.length > 0 && (
              <div className="space-y-1 sm:col-span-2">
                <label className={labelClass}>Production Order (optional)</label>
                <SearchableSelect
                  value={selectedOrderNumber}
                  onValueChange={selectOrder}
                  options={orders}
                  placeholder="Link to a production order (optional)..."
                  searchPlaceholder="Search order number or product..."
                  clearable
                />
              </div>
            )}
            <div className="space-y-1">
              <label className={labelClass}>Product</label>
              <ProductPicker products={products} value={productId} onChange={selectProduct} />
              {product && (
                <p className="text-[11px] text-[#64748B]">Shelf life {num(product.shelf_life_days) || 0} days · {product.product_code}</p>
              )}
              {product && labelBlock(product) && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {labelBlock(product)} — labels are blocked until this is fixed in Product Master.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Batch number *</label>
              <Input
                value={batchNumber}
                readOnly
                placeholder="Select product & production date"
                className={`${inputClass} opacity-90 font-semibold text-[#1D4ED8]`}
              />
              <p className="text-[11px] text-[#64748B]">
                Auto-generated: {batchPrefix || "PREFIX"} + date (DDMMYY) + alphabet suffix
              </p>
              {duplicate && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Already recorded for this product.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Alphabet Suffix *</label>
              <Input
                value={alphabetSuffix}
                onChange={(e) => setAlphabetSuffix(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3))}
                placeholder="e.g. A or T"
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Production date *</label>
              <Input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className={inputClass} />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Expiry date</label>
              <Input type="date" value={expiryDate} readOnly disabled className={`${inputClass} opacity-80`} />
              <p className="text-[11px] text-[#64748B]">
                {computedExpiry
                  ? `${shelfLifeMonthsFromDays(product?.shelf_life_days) > 0
                      ? `${shelfLifeMonthsFromDays(product?.shelf_life_days)} month`
                      : `${num(product?.shelf_life_days)} day`} shelf life → ${fmtDay(computedExpiry)}`
                  : num(product?.shelf_life_days) > 0
                    ? "Enter production date to calculate expiry."
                    : "This product has no shelf life set."}
              </p>
              {admin && (
                <button
                  type="button"
                  onClick={() => { setOverrideOpen((v) => !v); setOverrideDate(overrideOpen ? "" : (computedExpiry || productionDate)); }}
                  className="text-[11px] text-[#1D4ED8] hover:underline"
                >
                  {overrideOpen ? "Cancel override" : "Admin: override expiry date"}
                </button>
              )}
              {overrideOpen && (
                <div className="space-y-1 pt-1">
                  <Input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className={inputClass} />
                  <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason for the override (required)" className={inputClass} />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Quantity produced (cartons)</label>
              <Input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} placeholder="e.g. 500" />
            </div>
          </div>

          {product && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Recipe</p>
                <Link to="/recipe-master" className="text-[11px] text-[#1D4ED8] hover:underline">Recipe Master</Link>
              </div>
              {recipe ? (
                <>
                  <p className="text-sm text-[#0F294A]">
                    {recipe.recipe_name || "Recipe"} <span className="text-[#64748B]">· v{recipe.version}</span>
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    {(recipe.ingredients || []).length} ingredient(s) · {fmtQty(recipe.batch_cartons)} cartons per batch
                    {recipe.standard_yield_pct ? ` · standard yield ${fmtQty(recipe.standard_yield_pct)}%` : ""}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-amber-700">No recipe linked to this item yet — add one in Recipe Master.</p>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-[#E2E8F0] pt-3">
            <div className="flex items-center justify-between gap-2">
              <label className={labelClass}>Label layout</label>
              {product && (
                <button
                  type="button"
                  onClick={saveAsDefault}
                  disabled={layoutIsDefault}
                  className={`text-[11px] inline-flex items-center gap-1 ${layoutIsDefault ? "text-[#64748B]" : "text-[#1D4ED8] hover:underline"}`}
                >
                  <Star className="w-3 h-3" /> {layoutIsDefault ? "Saved as this product's default" : "Save as this product's default"}
                </button>
              )}
            </div>
            <LayoutPicker
              layouts={settings.layouts}
              value={layoutId}
              custom={custom}
              onSelect={setLayoutId}
              onCustomChange={setCustom}
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#E2E8F0] pt-3">
            <div className="space-y-1 w-32">
              <label className={labelClass}>Label copies</label>
              <Input type="number" min="1" max="200" value={copies} onChange={(e) => setCopies(e.target.value)} className={inputClass} />
            </div>
            <Button onClick={saveAndPrint} disabled={saving || !!duplicate} className={`${primaryButton} h-10 px-5`}>
              <Printer className="w-4 h-4 mr-1.5" />
              {saving ? "Saving..." : "Save & Print Labels"}
            </Button>
          </div>
        </div>

        <div className={`${panelClass} p-4 space-y-3 xl:sticky xl:top-4`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Label preview</p>
            <span className="text-[10px] text-[#64748B]">{layout.name} · {layout.width_mm} × {layout.height_mm} mm</span>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="inline-block shadow-lg">
              <LabelPreview layout={layout} data={labelData} />
            </div>
          </div>

          {quantity ? (
            <p className="text-[11px] text-[#64748B]">Quantity: {fmtQty(quantity)} cartons</p>
          ) : null}
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