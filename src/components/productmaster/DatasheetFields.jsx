import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import Field from "@/components/planning/Field";
import { DEFAULT_CUSTOMER, derivedFields } from "@/lib/productMaster";
import { loadLineTypeOptions } from "@/lib/masterOptions";
import { productionLines } from "@/lib/shiftLogConstants";
import { inputClass, selectClass } from "@/components/planning/styles";

const DEFAULT_LINE_TYPES = ["SAUCE", "POUCH", "1 KG", "SYRUP", "POWDER", "MAYO", "SAUCE/ MAYO", "MANUAL"];

const toName = (item) => {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  if (typeof item === "object") return String(item.name || item.value || item.label || "").trim();
  return "";
};

const unique = (...lists) => [...new Set(lists.flat().map(toName).filter(Boolean))];

// The datasheet fields; the calculated columns are shown but never typed in.
export default function DatasheetFields({ form, set, brands = [], customers = [], machines = [], recipeNames = [] }) {
  const [lineTypes, setLineTypes] = useState(DEFAULT_LINE_TYPES);

  useEffect(() => {
    loadLineTypeOptions()
      .then((rows) => {
        const merged = unique(DEFAULT_LINE_TYPES, rows);
        setLineTypes(merged);
      })
      .catch(() => {});
  }, []);

  const derived = derivedFields({
    carton_size: form.carton_size,
    net_weight_kg: form.net_weight_kg,
    batch_output_kg: form.batch_output_kg,
    shelf_life_months: form.shelf_life_months,
    cooking_time_hr: form.cooking_time_hr,
  });
  const brandOptions = unique(brands, [form.brand]);
  const customerOptions = unique([DEFAULT_CUSTOMER], customers, [form.customer]);
  const machineOptions = unique(machines, productionLines, [form.default_machine]);
  const lineTypeOptions = unique(lineTypes, [form.line_type]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Item Code *">
          <Input value={form.product_code} onChange={(e) => set("product_code", e.target.value)} className={inputClass} placeholder="RSPT350GX12" />
        </Field>
        <Field label="Carton Description *">
          <Input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className={inputClass} placeholder="RASTO TRADITIONAL PASTA SAUCE 350G X 12" />
        </Field>
        <Field label="Brand">
          <SearchableSelect
            value={form.brand || ""}
            onValueChange={(v) => set("brand", v)}
            options={brandOptions}
            placeholder="Select or enter brand..."
            searchPlaceholder="Search or type brand..."
            allowCustom
            clearable
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Recipe Name">
          <SearchableSelect
            value={form.recipe_name || ""}
            onValueChange={(v) => set("recipe_name", v)}
            options={unique(recipeNames, [form.recipe_name])}
            placeholder="Select or enter recipe..."
            searchPlaceholder="Search or type recipe..."
            allowCustom
            clearable
          />
        </Field>
        <Field label="Line Type">
          <SearchableSelect
            value={form.line_type || ""}
            onValueChange={(v) => set("line_type", v)}
            options={lineTypeOptions}
            placeholder="Select or enter line type..."
            searchPlaceholder="Search or type line type..."
            allowCustom
            clearable
          />
        </Field>
        <Field label="Cooking Time (hr)">
          <Input type="number" min="0" step="0.25" value={form.cooking_time_hr} onChange={(e) => set("cooking_time_hr", e.target.value)} className={inputClass} placeholder="1.75" />
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="Pcs per Carton">
          <Input type="number" min="0" value={form.carton_size} onChange={(e) => set("carton_size", e.target.value)} className={inputClass} placeholder="12" />
        </Field>
        <Field label="Net Weight / Pc (kg)">
          <Input type="number" min="0" step="0.001" value={form.net_weight_kg} onChange={(e) => set("net_weight_kg", e.target.value)} className={inputClass} placeholder="0.35" />
        </Field>
        <Field label="Batch Output (kg)">
          <Input type="number" min="0" value={form.batch_output_kg} onChange={(e) => set("batch_output_kg", e.target.value)} className={inputClass} placeholder="608" />
        </Field>
        <Field label="Net Filling (kg/Ctn)">
          <div className="h-9 flex items-center px-3 rounded-md border border-[#E2E8F0] bg-[#F6F8FC] text-[#1D4ED8] font-semibold">{derived.net_filling_kg || "—"}</div>
        </Field>
        <Field label="Cartons / Batch">
          <div className="h-9 flex items-center px-3 rounded-md border border-[#E2E8F0] bg-[#F6F8FC] text-[#1D4ED8] font-semibold">{derived.cartons_per_batch || "—"}</div>
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Batch Code">
          <Input value={form.batch_prefix} onChange={(e) => set("batch_prefix", e.target.value.toUpperCase().slice(0, 6))} className={inputClass} placeholder="RTP" />
        </Field>
        <Field label="Shelf Life (Months)">
          <Input type="number" min="0" value={form.shelf_life_months} onChange={(e) => set("shelf_life_months", e.target.value)} className={inputClass} placeholder="12" />
        </Field>
        <Field label="Customer">
          <SearchableSelect
            value={form.customer || DEFAULT_CUSTOMER}
            onValueChange={(v) => set("customer", v || DEFAULT_CUSTOMER)}
            options={customerOptions}
            placeholder="Select or enter customer..."
            searchPlaceholder="Search or type customer..."
            allowCustom
          />
        </Field>
        <Field label="Status">
          <Select value={form.status === "Inactive" ? "Inactive" : "Active"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="SKU Barcode">
          <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} className={inputClass} placeholder="9555721709349" />
        </Field>
        <Field label="Carton Barcode">
          <Input value={form.carton_barcode} onChange={(e) => set("carton_barcode", e.target.value)} className={inputClass} placeholder="9555721709424" />
        </Field>
        <Field label="Default Machine">
          <SearchableSelect
            value={form.default_machine || ""}
            onValueChange={(v) => set("default_machine", v)}
            options={machineOptions}
            placeholder="Select or enter machine..."
            searchPlaceholder="Search or type machine..."
            allowCustom
            clearable
          />
        </Field>
      </div>

      <div>
        <Field label="Remarks">
          <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputClass} placeholder="Optional remark" />
        </Field>
      </div>
    </div>
  );
}