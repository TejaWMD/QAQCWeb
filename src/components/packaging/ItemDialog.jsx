import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { loadProductOptions, loadSupplierOptions } from "@/lib/masterOptions";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

const empty = (categories, units) => ({
  item_code: "",
  description: "",
  category: categories[0] || "",
  unit: units[0] || "",
  quantity: "",
  min_level: "",
  default_rack: "",
  supplier: "",
  active: true,
  linked_product: "",
  qty_per_unit: "",
});

export default function ItemDialog({ open, item, categories, units, racks, onClose, onSaved }) {
  const [form, setForm] = useState(empty(categories, units));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState({ suppliers: [], products: [] });

  useEffect(() => {
    if (!open || opts.suppliers.length) return;
    Promise.all([loadSupplierOptions(), loadProductOptions()])
      .then(([suppliers, products]) => setOpts({ suppliers, products }))
      .catch(() => {});
  }, [open, opts.suppliers.length]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      item
        ? {
            item_code: item.item_code || "",
            description: item.description || "",
            category: item.category || "",
            unit: item.unit || "",
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
    if (!form.item_code.trim()) return setError("Item code is required.");
    setSaving(true);
    setError("");
    try {
      if (!item) {
        const page = await base44.entities.PackagingItem.filter({ item_code: form.item_code.trim() }, { limit: 1 });
        if ((page.items || []).length) throw new Error(`${form.item_code.trim()} is already in the packaging stock list.`);
      }
      const payload = {
        item_code: form.item_code.trim(),
        description: form.description.trim(),
        category: form.category,
        unit: form.unit,
        min_level: Number(form.min_level) || 0,
        default_rack: form.default_rack,
        supplier: form.supplier.trim(),
        active: form.active,
        linked_product: form.linked_product.trim(),
        qty_per_unit: Number(form.qty_per_unit) || 0,
      };
      const saved = item
        ? await base44.entities.PackagingItem.update(item.id, payload)
        : await base44.entities.PackagingItem.create({
            ...payload,
            quantity: Math.max(0, Number(form.quantity) || 0),
          });
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Could not save the item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{item ? "Edit packaging item" : "Add packaging item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item Code *</label>
              <Input value={form.item_code} onChange={(e) => set("item_code", e.target.value)} placeholder="e.g. LBL-250" className={FIELD} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Description</label>
              <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Item name" className={FIELD} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Category</label>
              <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Unit of Measure</label>
              <Select value={form.unit || undefined} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Minimum Level</label>
              <Input type="number" min="0" value={form.min_level} onChange={(e) => set("min_level", e.target.value)} placeholder="Low stock at or below this" className={FIELD} />
            </div>
            {!item && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Initial Quantity</label>
                <Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" className={FIELD} />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Default Rack</label>
              <Select value={form.default_rack || "none"} onValueChange={(v) => set("default_rack", v === "none" ? "" : v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Select rack" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default rack</SelectItem>
                  {racks.map((r) => <SelectItem key={r.id} value={r.rack_code}>{r.rack_code}{r.zone ? ` · ${r.zone}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Supplier</label>
              <SearchableSelect
                value={form.supplier}
                onValueChange={(v) => set("supplier", v)}
                options={opts.suppliers}
                placeholder="Select supplier..."
                searchPlaceholder="Search supplier..."
                allowCustom
                clearable
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Linked Product</label>
              <SearchableSelect
                value={form.linked_product}
                onValueChange={(v) => set("linked_product", v)}
                options={opts.products.map((p) => ({
                  value: p.product_name,
                  label: p.product_code ? `${p.product_code} — ${p.product_name}` : p.product_name,
                }))}
                placeholder="Select linked product..."
                searchPlaceholder="Search product..."
                allowCustom
                clearable
              />
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