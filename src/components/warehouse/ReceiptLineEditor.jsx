import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Trash2 } from "lucide-react";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

const Field = ({ label, children, className = "" }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">{label}</label>
    {children}
  </div>
);

// One item line on a goods receipt. Item code drives the description auto-fill.
export default function ReceiptLineEditor({ index, line, items, products = [], batches = [], units, racks, onItemCode, onChange, onRemove, onAddItem, removable }) {
  const code = (line.item_code || "").trim();
  const known = items.some((i) => (i.item_code || "").toLowerCase() === code.toLowerCase());

  const itemOptions = [
    ...items.map((i) => ({
      value: i.item_code,
      label: i.description ? `${i.item_code} — ${i.description}` : i.item_code,
      sublabel: i.unit ? `Warehouse · ${i.unit}` : "Warehouse",
    })),
    ...products.map((p) => ({
      value: p.product_code,
      label: `${p.product_code} — ${p.product_name}`,
      sublabel: p.brand ? `Product Master · ${p.brand}` : "Product Master",
    })),
  ];

  const batchOptions = line.product_id
    ? batches.filter((b) => b.product_id === line.product_id || b.product_code === line.product_code)
    : batches;

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-widest text-[#64748B]">ITEM {index + 1}</p>
        {removable && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-8 text-rose-600 hover:bg-[#F1F5F9] hover:text-rose-600">
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Remove</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Item Code *">
          <SearchableSelect
            value={line.item_code}
            onValueChange={(v) => onItemCode(v)}
            options={itemOptions}
            placeholder="Select or scan item..."
            searchPlaceholder="Search item or product code..."
            allowCustom
          />
          {line.product_id && (
            <p className="mt-1 text-[11px] text-[#1D4ED8]">
              Product Master · {line.product_code}
              {line.product_recipe ? ` · ${line.product_recipe}` : ""}
            </p>
          )}
          {code && !known && !line.product_id && (
            <button
              type="button"
              onClick={() => onAddItem(line)}
              className="text-[11px] text-[#1D4ED8] hover:underline mt-1"
            >
              Unknown item — add “{code}” to the item list
            </button>
          )}
        </Field>

        <Field label="Product Description *" className="sm:col-span-2">
          <Input
            value={line.product_description}
            onChange={(e) => onChange({ product_description: e.target.value })}
            placeholder="Auto-fills from the item code"
            className={FIELD}
          />
        </Field>

        <Field label="Batch Number *">
          <SearchableSelect
            value={line.batch_number}
            onValueChange={(v) => onChange({ batch_number: v })}
            options={batchOptions}
            placeholder="Select or enter batch..."
            searchPlaceholder="Search batch..."
            allowCustom
          />
        </Field>

        <Field label="Quantity Received *">
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            placeholder="0"
            className={FIELD}
          />
        </Field>

        <Field label="Unit *">
          <Select value={line.unit || undefined} onValueChange={(v) => onChange({ unit: v })}>
            <SelectTrigger className={FIELD}><SelectValue placeholder="Select unit" /></SelectTrigger>
            <SelectContent>
              {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Rack Location *">
          <Select value={line.rack_location || undefined} onValueChange={(v) => onChange({ rack_location: v })}>
            <SelectTrigger className={FIELD}><SelectValue placeholder={racks.length ? "Select rack" : "No active racks"} /></SelectTrigger>
            <SelectContent>
              {racks.map((r) => <SelectItem key={r.id} value={r.rack_code}>{r.rack_code}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Expiry Date">
          <Input
            type="date"
            value={line.expiry_date}
            onChange={(e) => onChange({ expiry_date: e.target.value })}
            className={FIELD}
          />
        </Field>

        <Field label="Remarks" className="sm:col-span-2 lg:col-span-4">
          <Input
            value={line.remarks}
            onChange={(e) => onChange({ remarks: e.target.value })}
            placeholder="Optional notes for this item"
            className={FIELD}
          />
        </Field>
      </div>
    </div>
  );
}