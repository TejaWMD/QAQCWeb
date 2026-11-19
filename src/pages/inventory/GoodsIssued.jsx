import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Save, QrCode } from "lucide-react";
import OutLineRow from "@/components/packaging/OutLineRow";
import { CameraQRScanner } from "@/components/warehouse/QRScanner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { parseQRPayload } from "@/lib/qrParser";
import { findProduct } from "@/lib/findProduct";
import { fmtQty, loadPackagingSettings, loadProductionOrders, newGroupId, submitStockUse } from "@/lib/packaging";
import { loadProducts } from "@/lib/planning";
import { loadMachineOptions, loadProductionOrderOptions } from "@/lib/masterOptions";
import { todayStr } from "@/lib/warehouse";

let seq = 0;
const blankLine = () => ({
  key: `out${++seq}`,
  item_id: "",
  quantity: "",
  batch_number: "",
  production_order: "",
  production_line: "",
  product_id: "",
  product_code: "",
  product_name: "",
  remarks: "",
});

// Goods issued: stock leaving the warehouse for production, several lines at a time.
export default function GoodsIssued() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prodOrders, setProdOrders] = useState([]);
  const [linesOpts, setLinesOpts] = useState([]);
  const [settings, setSettings] = useState({ threshold: 0 });
  const [date, setDate] = useState(todayStr());
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qrInput, setQrInput] = useState("");

  const handleQrScan = async (rawText) => {
    const parsed = parseQRPayload(rawText);
    if (!parsed.ok) {
      toast({ title: "Could not read QR", description: parsed.error, variant: "destructive" });
      return;
    }
    const q = parsed.data;
    const candidates = [q.gtin, q.item_code, q.sku, q.item_name, q.description, ...(q.textTokens || [])]
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    let matchedItem = null;
    for (const c of candidates) {
      const low = c.toLowerCase();
      matchedItem = items.find((i) =>
        (i.item_code || "").toLowerCase() === low ||
        (i.description || "").toLowerCase() === low ||
        (i.linked_product || "").toLowerCase() === low
      );
      if (matchedItem) break;
    }

    let matchedProduct = null;
    for (const c of candidates) {
      const found = await findProduct(c).catch(() => null);
      if (found?.product) {
        matchedProduct = found.product;
        break;
      }
    }

    const patch = {
      item_id: matchedItem?.id || "",
      batch_number: q.batch_number || "",
      product_id: matchedProduct?.id || "",
      product_code: matchedProduct?.product_code || "",
      product_name: matchedProduct?.product_name || "",
    };

    setLines((prev) => {
      const idx = prev.findIndex((l) => !l.item_id && !l.batch_number);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return [...prev, { ...blankLine(), ...patch }];
    });
    setQrInput("");
    toast({
      title: "QR scanned",
      description: `${matchedItem?.item_code || matchedProduct?.product_name || q.item_name || "Scanned"} · Batch ${patch.batch_number || "—"}`,
    });
  };

  const load = async () => {
    const [itemPage, loadedSettings] = await Promise.all([
      base44.entities.PackagingItem.filter({ active: true }, { sort: "item_code", limit: 500 }),
      loadPackagingSettings(),
    ]);
    setItems(itemPage.items || []);
    setSettings(loadedSettings);
  };

  useEffect(() => {
    load();
    loadProductionOrders().then(setOrders).catch(() => setOrders([]));
    loadProductionOrderOptions().then(setProdOrders).catch(() => setProdOrders([]));
    loadMachineOptions().then(setLinesOpts).catch(() => setLinesOpts([]));
    loadProducts().then((rows) => setProducts(rows.filter((p) => p.active !== false))).catch(() => setProducts([]));
  }, []);

  const setLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Picking a production order also links the line to its Product Master item.
  const setLineField = (key, patch) => {
    if (patch.production_order === undefined) return setLine(key, patch);
    const product = products.find((p) => p.product_name && patch.production_order.startsWith(p.product_name));
    return setLine(key, {
      ...patch,
      ...(product ? { product_id: product.id, product_code: product.product_code || "", product_name: product.product_name || "" } : {}),
    });
  };

  const save = async () => {
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      const item = items.find((x) => x.id === l.item_id);
      if (!item) return setError(`Line ${i + 1}: select an item.`);
      const qty = Number(l.quantity) || 0;
      if (!(qty > 0)) return setError(`Line ${i + 1}: quantity must be greater than zero.`);
      if (qty > Number(item.quantity || 0)) return setError(`Line ${i + 1}: only ${fmtQty(item.quantity)} ${item.unit || ""} of ${item.item_code} in stock.`);
    }
    setError("");
    setSaving(true);
    const group = newGroupId("OUT");
    let approvals = 0;
    try {
      for (const l of lines) {
        const live = await base44.entities.PackagingItem.get(l.item_id);
        const result = await submitStockUse({
          item: live,
          quantity: Number(l.quantity),
          user,
          threshold: settings.threshold,
          extras: {
            movement_date: date,
            batch_number: (l.batch_number || "").trim(),
            production_order: l.production_order || reference,
            production_line: l.production_line,
            remarks: l.remarks,
            source: "Goods Issued",
            group_id: group,
            ...(l.product_id ? { product_id: l.product_id, product_code: l.product_code } : {}),
          },
        });
        if (result?.approval) approvals += 1;
      }
      toast({
        title: "Stock issued",
        description: approvals
          ? `${lines.length - approvals} line(s) deducted, ${approvals} sent for approval.`
          : `${lines.length} line${lines.length === 1 ? "" : "s"} deducted from stock.`,
      });
      setLines([blankLine()]);
      setReference("");
      await load();
    } catch (e) {
      setError(e?.message || "Could not record the issue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-[#0F294A] text-lg font-semibold">Goods Issued</h2>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-white border-[#E2E8F0] text-[#0F294A]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Issue Reference / Order</label>
            <SearchableSelect
              value={reference}
              onValueChange={setReference}
              options={[...prodOrders, ...orders]}
              placeholder="Select order or enter reference..."
              searchPlaceholder="Search order..."
              allowCustom
              clearable
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-2.5 flex flex-wrap items-center gap-2">
        <QrCode className="w-4 h-4 text-[#1D4ED8] shrink-0" />
        <Input
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && qrInput.trim()) { e.preventDefault(); handleQrScan(qrInput); } }}
          placeholder="Scan or paste QR payload and press Enter"
          className="bg-white border-[#E2E8F0] text-[#0F294A] flex-1 min-w-[200px]"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => qrInput.trim() && handleQrScan(qrInput)} className="border-[#E2E8F0] bg-[#F6F8FC] text-[#1D4ED8] hover:bg-[#F1F5F9]">
          Parse
        </Button>
        <CameraQRScanner onDecode={handleQrScan} />
      </div>

      <div className="space-y-2">
        {lines.map((line) => (
          <OutLineRow
            key={line.key}
            line={line}
            items={items}
            products={products}
            orders={[...prodOrders, ...orders]}
            machineLines={linesOpts}
            onChange={(patch) => setLineField(line.key, patch)}
            onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
            removable={lines.length > 1}
          />
        ))}
      </div>

      <Button variant="outline" onClick={() => setLines((prev) => [...prev, blankLine()])} className="w-full border-dashed border-[#E2E8F0] bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
        <Plus className="w-4 h-4" /> Add line
      </Button>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-[#F6F8FC] border-t border-[#E2E8F0] flex flex-wrap items-center gap-3">
        <p className="text-xs text-[#64748B]">{lines.length} line{lines.length === 1 ? "" : "s"} · issued by {user?.full_name || user?.email || "—"}</p>
        <Button onClick={save} disabled={saving} className="w-full sm:w-auto sm:ml-auto bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold h-11">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Issue stock"}
        </Button>
      </div>
    </div>
  );
}