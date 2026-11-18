import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash2 } from "lucide-react";
import { INGREDIENT_UNITS, num } from "@/lib/planning";
import { inputClass } from "@/components/planning/styles";

// Ingredient rows for a recipe. Materials come from the warehouse item list when
// it has any; otherwise an ingredient name can be chosen or entered.
export default function IngredientEditor({ value = [], onChange, materials = [] }) {
  const update = (idx, patch) => onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));
  const add = () => onChange([...value, { material_id: "", item_code: "", material_name: "", unit: "kg", quantity_per_batch: "" }]);

  const pickMaterial = (idx, nextVal) => {
    const m = materials.find((x) => x.id === nextVal || x.description === nextVal || x.item_code === nextVal);
    if (m) {
      update(idx, { material_id: m.id, item_code: m.item_code, material_name: m.description || m.item_code, unit: m.unit || "kg" });
    } else {
      update(idx, { material_id: "", item_code: "", material_name: nextVal });
    }
  };

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: m.description ? `${m.item_code} · ${m.description}` : m.item_code,
    sublabel: m.unit || undefined,
  }));

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-[#64748B]">No ingredients yet.</p>}
      {value.map((row, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_96px_88px_36px] gap-2 items-center">
          <SearchableSelect
            value={row.material_id || row.material_name || ""}
            onValueChange={(v) => pickMaterial(idx, v)}
            options={materialOptions}
            placeholder="Select material..."
            searchPlaceholder="Search material..."
            allowCustom
          />
          <Input
            type="number"
            min="0"
            step="any"
            value={row.quantity_per_batch}
            onChange={(e) => update(idx, { quantity_per_batch: num(e.target.value) })}
            className={inputClass}
            placeholder="Qty / batch"
          />
          <SearchableSelect
            value={row.unit || "kg"}
            onValueChange={(v) => update(idx, { unit: v })}
            options={INGREDIENT_UNITS}
            placeholder="Unit"
            searchPlaceholder="Unit..."
            allowCustom
          />
          <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-[#64748B] hover:text-rose-600 hover:bg-rose-600/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full border-dashed border-[#E2E8F0] bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
        <Plus className="w-4 h-4" /> Add ingredient
      </Button>
    </div>
  );
}
