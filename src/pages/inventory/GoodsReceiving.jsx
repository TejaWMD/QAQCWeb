import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Save, List, Settings as SettingsIcon, AlertTriangle, QrCode } from "lucide-react";
import ReceiptLineEditor from "@/components/warehouse/ReceiptLineEditor";
import ItemListDialog from "@/components/warehouse/ItemListDialog";
import QuickAddItemDialog from "@/components/warehouse/QuickAddItemDialog";
import WarehouseSettingsDialog from "@/components/warehouse/WarehouseSettingsDialog";
import { CameraQRScanner } from "@/components/warehouse/QRScanner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { parseQRPayload } from "@/lib/qrParser";
import { actingUserName } from "@/lib/permissions";
import { findProduct } from "@/lib/findProduct";
import { loadRecipes } from "@/lib/planning";
import { productLink, recipeOf } from "@/lib/productLinks";
import {
  loadBatchOptions,
  loadProductOptions,
  loadPurchaseOrderOptions,
  loadSupplierOptions,
} from "@/lib/masterOptions";
import {
  DEFAULT_UNITS,
  SETTINGS_KEY,
  duplicateKey,
  eventStamp,
  isWarehouseSupervisor,
  newGroupId,
  todayStr,
} from "@/lib/warehouse";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";
let seq = 0;

const blankLine = (unit = "") => ({
  id: `l${++seq}`,
  item_code: "",
  product_id: "",
  product_code: "",
  product_name: "",
  product_recipe: "",
  product_description: "",
  batch_number: "",
  quantity: "",
  unit,
  rack_location: "",
  expiry_date: "",
  remarks: "",
});

// Goods receiving: one delivery note, several item lines, keyed in from a phone
// or tablet on the warehouse floor.
export default function GoodsReceiving() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [racks, setRacks] = useState([]);
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [header, setHeader] = useState({ date_received: todayStr(), supplier: "", delivery_note: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState(null);
  const [quickAdd, setQuickAdd] = useState(null);
  const [itemListOpen, setItemListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [opts, setOpts] = useState({ suppliers: [], pos: [], products: [], batches: [] });

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
        (i.description || "").toLowerCase() === low
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
      item_code: matchedItem?.item_code || matchedProduct?.product_code || q.item_code || q.gtin || "",
      product_id: matchedProduct?.id || "",
      product_code: matchedProduct?.product_code || "",
      product_name: matchedProduct?.product_name || "",
      product_recipe: matchedProduct ? (recipeOf(recipes, matchedProduct)?.recipe_name || "") : "",
      product_description: matchedItem?.description || matchedProduct?.product_name || q.description || q.item_name || "",
      batch_number: q.batch_number || "",
      expiry_date: q.expiry_date || "",
      unit: matchedItem?.unit || (matchedProduct ? "carton" : units[0] || ""),
    };

    setLines((prev) => {
      const idx = prev.findIndex((l) => !l.item_code && !l.batch_number);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      return [...prev, { ...blankLine(units[0]), ...patch }];
    });
    setQrInput("");
    toast({
      title: "QR scanned",
      description: `${patch.product_description || patch.item_code || "Item"} · Batch ${patch.batch_number || "—"}`,
    });
  };

  const load = async () => {
    const [itemRows, rackPage, settingsPage, recipeRows] = await Promise.all([
      base44.entities.WarehouseItem.list("-created_date", 500),
      base44.entities.WarehouseRack.filter({ status: "Active" }, { sort: "rack_code", limit: 500 }),
      base44.entities.WarehouseSettings.filter({ key: SETTINGS_KEY }, { limit: 1 }),
      loadRecipes().catch(() => []),
    ]);
    setItems(Array.isArray(itemRows) ? itemRows : itemRows?.items || []);
    setRacks(rackPage.items || []);
    setRecipes(Array.isArray(recipeRows) ? recipeRows : []);
    const configured = (settingsPage.items || [])[0]?.units;
    const nextUnits = Array.isArray(configured) && configured.length ? configured : DEFAULT_UNITS;
    setUnits(nextUnits);
    setLines((prev) => prev.map((l) => (l.unit ? l : { ...l, unit: nextUnits[0] })));
  };

  useEffect(() => {
    load();
    Promise.all([
      loadSupplierOptions(),
      loadPurchaseOrderOptions(),
      loadProductOptions(),
      loadBatchOptions(),
    ])
      .then(([suppliers, pos, products, batches]) => setOpts({ suppliers, pos, products, batches }))
      .catch(() => {});
  }, []);

  const setLine = (id, patch) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Typing a known item code fills in the description and its default unit. A code that
  // is not a warehouse item is looked up in the Product Master (piece barcode, carton
  // barcode or Item Code), so finished goods received back stay linked to their item.
  const handleItemCode = async (id, value) => {
    const match = items.find((i) => (i.item_code || "").toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setLines((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                item_code: value,
                product_id: "",
                product_code: "",
                product_name: "",
                product_recipe: "",
                product_description: match.description || l.product_description,
                unit: match.unit || l.unit,
              }
            : l
        )
      );
      return;
    }

    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, item_code: value } : l)));
    if (!value.trim()) return;
    const found = await findProduct(value);
    const product = found.product;
    if (!product) return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === id && l.item_code.trim() === value.trim()
          ? {
              ...l,
              item_code: product.product_code || value,
              ...productLink(product),
              product_recipe: recipeOf(recipes, product)?.recipe_name || "",
              product_description: l.product_description || product.product_name || "",
            }
          : l
      )
    );
  };

  const validate = () => {
    if (!header.date_received) return "Date received is required.";
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!l.item_code.trim()) return `Item ${i + 1}: item code is required.`;
      if (!l.batch_number.trim()) return `Item ${i + 1}: batch number is required.`;
      if (!(Number(l.quantity) > 0)) return `Item ${i + 1}: quantity must be greater than zero.`;
      if (!l.unit) return `Item ${i + 1}: select a unit of measure.`;
      if (!l.rack_location) return `Item ${i + 1}: select a rack location.`;
    }
    const seen = new Set();
    for (const l of lines) {
      const key = duplicateKey(l);
      if (seen.has(key)) return `Item ${l.item_code} / batch ${l.batch_number} appears twice in this receipt.`;
      seen.add(key);
    }
    return "";
  };

  const findDuplicates = async () => {
    const clashes = [];
    for (const l of lines) {
      const page = await base44.entities.GoodsReceipt.filter(
        { date_received: header.date_received, batch_number: l.batch_number.trim() },
        { limit: 10 }
      );
      const hit = (page.items || []).some(
        (r) => (r.item_code || "").toLowerCase() === l.item_code.trim().toLowerCase()
      );
      if (hit) clashes.push(l);
    }
    return clashes;
  };

  const save = async (skipDuplicateCheck = false) => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (!skipDuplicateCheck) {
        const clashes = await findDuplicates();
        if (clashes.length) {
          setDuplicates(clashes);
          return;
        }
      }

      const group = newGroupId();
      await base44.entities.GoodsReceipt.bulkCreate(
        lines.map((l) => ({
          receipt_group_id: group,
          date_received: header.date_received,
          supplier: header.supplier.trim(),
          delivery_note: header.delivery_note.trim(),
          ...(l.product_id ? { product_id: l.product_id, product_code: l.product_code } : {}),
          item_code: l.item_code.trim(),
          product_description: l.product_description.trim(),
          batch_number: l.batch_number.trim(),
          quantity: Number(l.quantity),
          unit: l.unit,
          rack_location: l.rack_location,
          remarks: l.remarks.trim(),
          received_by: actingUserName(user),
          received_by_id: user?.id || "",
          ...(l.expiry_date ? { expiry_date: l.expiry_date } : {}),
        }))
      );

      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Warehouse Goods Receiving",
          action: "Created",
          record_id: group,
          details: `Received ${lines.length} item line${lines.length === 1 ? "" : "s"}${
            header.delivery_note.trim() ? ` on delivery note ${header.delivery_note.trim()}` : ""
          }`,
        });
      } catch {
        // An audit write must never block the receipt itself.
      }

      toast({ title: "Goods received", description: `${lines.length} line${lines.length === 1 ? "" : "s"} saved.` });
      setDuplicates(null);
      setHeader((h) => ({ ...h, supplier: "", delivery_note: "" }));
      setLines([blankLine(units[0])]);
    } catch (e) {
      setError(e?.message || "Could not save the receipt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Goods Receiving</h2>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setItemListOpen(true)} className="flex-1 sm:flex-none border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
            <List className="w-4 h-4" /> Item list
          </Button>
          {isWarehouseSupervisor(user) && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="flex-1 sm:flex-none border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
              <SettingsIcon className="w-4 h-4" /> Settings
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Date Received *</label>
            <Input
              type="date"
              value={header.date_received}
              onChange={(e) => setHeader((h) => ({ ...h, date_received: e.target.value }))}
              className={FIELD}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Supplier</label>
            <SearchableSelect
              value={header.supplier}
              onValueChange={(v) => setHeader((h) => ({ ...h, supplier: v }))}
              options={opts.suppliers}
              placeholder="Select supplier..."
              searchPlaceholder="Search supplier..."
              allowCustom
              clearable
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Delivery Note / PO No.</label>
            <SearchableSelect
              value={header.delivery_note}
              onValueChange={(v) => setHeader((h) => ({ ...h, delivery_note: v }))}
              options={opts.pos}
              placeholder="Select PO or type DO..."
              searchPlaceholder="Search PO number..."
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
          className={`${FIELD} flex-1 min-w-[200px]`}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => qrInput.trim() && handleQrScan(qrInput)} className="border-[#E2E8F0] bg-[#F6F8FC] text-[#1D4ED8] hover:bg-[#F1F5F9]">
          Parse
        </Button>
        <CameraQRScanner onDecode={handleQrScan} />
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <ReceiptLineEditor
            key={line.id}
            index={index}
            line={line}
            items={items}
            products={opts.products}
            batches={opts.batches}
            units={units}
            racks={racks}
            onItemCode={(value) => handleItemCode(line.id, value)}
            onChange={(patch) => setLine(line.id, patch)}
            onRemove={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
            removable={lines.length > 1}
            onAddItem={(l) => setQuickAdd({ lineId: l.id, item_code: l.item_code.trim(), product_description: l.product_description })}
          />
        ))}
      </div>

      <Button
        variant="outline"
        onClick={() => setLines((prev) => [...prev, blankLine(units[0])])}
        className="w-full border-dashed border-[#E2E8F0] bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]"
      >
        <Plus className="w-4 h-4" /> Add item line
      </Button>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-[#F6F8FC] border-t border-[#E2E8F0] flex flex-wrap items-center gap-3">
        <p className="text-xs text-[#64748B]">
          {lines.length} item line{lines.length === 1 ? "" : "s"} · keyed in by {actingUserName(user) || "—"}
        </p>
        <Button
          onClick={() => save()}
          disabled={saving}
          className="w-full sm:w-auto sm:ml-auto bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold h-11"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save receipt"}
        </Button>
      </div>

      {duplicates && (
        <Dialog open onOpenChange={(o) => !o && setDuplicates(null)}>
          <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#0F294A] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" /> Possible duplicate
              </DialogTitle>
              <DialogDescription className="text-[#64748B] text-sm">
                These items were already received today with the same batch number.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 text-sm text-[#64748B]">
              {duplicates.map((d) => (
                <li key={d.id} className="rounded-md border border-[#E2E8F0] bg-white px-3 py-2">
                  <span className="text-[#0F294A]">{d.item_code}</span> · batch {d.batch_number}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDuplicates(null)} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
                Go back and check
              </Button>
              <Button onClick={() => save(true)} disabled={saving} className="bg-amber-500 hover:bg-[#f58a1f] text-[#0F294A]">
                Save anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {itemListOpen && (
        <ItemListDialog
          items={items}
          units={units}
          onClose={() => setItemListOpen(false)}
          onChanged={load}
        />
      )}

      <QuickAddItemDialog
        request={quickAdd}
        units={units}
        onClose={() => setQuickAdd(null)}
        onCreated={(item, lineId) => {
          setLines((prev) =>
            prev.map((l) =>
              l.id === lineId
                ? { ...l, product_description: l.product_description || item.description || "", unit: l.unit || item.unit || "" }
                : l
            )
          );
          load();
        }}
      />

      <WarehouseSettingsDialog
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); load(); }}
        updatedBy={actingUserName(user)}
      />
    </div>
  );
}