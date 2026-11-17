import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ITEM_CATEGORIES } from "@/lib/warehouse";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

// Adds an item to the warehouse item list. Used both from the item list and from
// the "add new item" shortcut on the receiving form.
export default function ItemForm({ initial = {}, units, onSaved, onCancel }) {
  const [code, setCode] = useState(initial.item_code || "");
  const [description, setDescription] = useState(initial.description || "");
  const [unit, setUnit] = useState(initial.unit || units[0] || "pcs");
  const [category, setCategory] = useState(initial.category || ITEM_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Item code is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const page = await base44.entities.WarehouseItem.filter({ item_code: code.trim() }, { limit: 1 });
      if ((page.items || []).length) throw new Error(`${code.trim()} is already in the item list.`);
      const item = await base44.entities.WarehouseItem.create({
        item_code: code.trim(),
        description: description.trim(),
        unit,
        category,
      });
      onSaved?.(item);
    } catch (err) {
      setError(err?.message || "Could not save the item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item Code *</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. RM-1001" className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product description" className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Unit</label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
            <SelectContent>
              {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ITEM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
          {saving ? "Saving..." : "Save item"}
        </Button>
      </div>
    </form>
  );
}