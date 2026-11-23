import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayStr } from "@/lib/warehouse";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

const empty = (categories, units) => ({
  item_code: "",
  description: "",
  category: categories[0] || "Packaging",
  unit: units[0] || "PCS",
  quantity: "",
  min_level: "",
  default_rack: "",
  supplier: "",
  active: true,
  linked_product: "",
  qty_per_unit: "",
});

export default function ItemDialog({ open, item, categories = [], units = [], onClose, onSaved }) {
  const [form, setForm] = useState(empty(categories, units));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      item
        ? {
            item_code: item.item_code || "",
            description: item.description || item.name || "",
            category: item.category || categories[0] || "Packaging",
            unit: item.unit || units[0] || "PCS",
            quantity: item.quantity != null ? String(item.quantity) : "",
            min_level: item.min_level != null ? String(item.min_level) : "",
            default_rack: item.default_rack || "",
            supplier: item.supplier || "",
            active: item.active !== false,
            linked_product: item.linked_product || "",
            qty_per_unit: item.qty_per_unit != null ? String(item.qty_per_unit) : "",
          }
        : empty(categories, units)
    );
  }, [open, item]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    const cleanDesc = form.description.trim();
    const cleanCode = form.item_code.trim() || cleanDesc.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").slice(0, 24);
    if (!cleanDesc && !cleanCode) return setError("Item name or code is required.");
    setSaving(true);
    setError("");
    try {
      if (!item) {
        const page = await base44.entities.PackagingItem.filter({ item_code: cleanCode }, { limit: 1 });
        if ((page.items || []).length) throw new Error(`${cleanCode} is already in the packaging stock list.`);
      }
      const payload = {
        item_code: cleanCode,
        description: cleanDesc || cleanCode,
        category: form.category,
        unit: form.unit,
        min_level: Number(form.min_level) || 0,
        default_rack: form.default_rack,
        supplier: form.supplier.trim(),
        active: form.active,
        linked_product: form.linked_product.trim(),
        qty_per_unit: Number(form.qty_per_unit) || 0,
      };
      const initialQty = Math.max(0, Number(form.quantity) || 0);
      const saved = item
        ? await base44.entities.PackagingItem.update(item.id, {
            ...payload,
            ...(form.quantity !== "" ? { quantity: initialQty } : {}),
          })
        : await base44.entities.PackagingItem.create({
            ...payload,
            quantity: initialQty,
          });
      if (!item && saved?.id && initialQty > 0) {
        try {
          await base44.entities.PackagingMovement.create({
            item_id: saved.id,
            item_code: saved.item_code,
            item_name: saved.description || saved.item_code,
            category: saved.category || "",
            unit: saved.unit || "",
            type: "In",
            quantity: initialQty,
            movement_date: todayStr(),
            batch_number: "OPENING",
            rack_location: saved.default_rack || "",
            supplier: saved.supplier || "",
            remarks: "Opening balance",
            source: "Opening Balance",
          });
        } catch {
          // Non-blocking
        }
      }
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Could not save the item.");
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = [...new Set(["Cartons", "Packaging", "Bottles & Jars", "Labels", "Caps & Closures", "Pouches & Foil", ...categories])];
  const unitOptions = [...new Set(["PCS", "BAG", "ROLL", "BOX", "KG", ...units])];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{item ? "Edit packaging item" : "Add packaging item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item Name / Description *</label>
              <Input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="e.g. LIME JUICE 500ML BOTTLE"
                className={FIELD}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item Code</label>
              <Input value={form.item_code} onChange={(e) => set("item_code", e.target.value)} placeholder="e.g. LBL-250 (auto if blank)" className={FIELD} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Category</label>
              <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Unit of Measure</label>
              <Select value={form.unit || undefined} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Minimum Level</label>
              <Input type="number" min="0" value={form.min_level} onChange={(e) => set("min_level", e.target.value)} placeholder="Low stock at or below this" className={FIELD} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">{item ? "Current Quantity" : "Initial Quantity"}</label>
              <Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" className={FIELD} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Qty per Finished Unit</label>
              <Input type="number" min="0" step="0.001" value={form.qty_per_unit} onChange={(e) => set("qty_per_unit", e.target.value)} placeholder="e.g. 1" className={FIELD} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="packaging-active" checked={form.active} onCheckedChange={(v) => set("active", v === true)} />
            <Label htmlFor="packaging-active" className="text-sm text-[#64748B]">Active</Label>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">
              {saving ? "Saving..." : "Save item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
