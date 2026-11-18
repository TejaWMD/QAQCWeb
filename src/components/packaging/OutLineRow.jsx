import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Trash2 } from "lucide-react";
import { productionLines } from "@/lib/shiftLogConstants";
import { fmtQty, loadItemBatches } from "@/lib/packaging";
import ProductPicker from "@/components/labels/ProductPicker";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

// One stock-out line: item, quantity, batch consumed, the Product Master item it was
// issued for and the production order it went to.
export default function OutLineRow({ line, items, products = [], orders = [], machineLines = [], onChange, onRemove, removable }) {
  const item = items.find((i) => i.id === line.item_id);
  const [batches, setBatches] = useState([]);

  useEffect(() => {
    if (!line.item_id) {
      setBatches([]);
      return;
    }
    loadItemBatches(line.item_id)
      .then((rows) =>
        setBatches(
          (rows || [])
            .filter((r) => r.quantity > 0 && r.batch_number)
            .map((r) => ({
              value: r.batch_number,
              label: r.batch_number,
              sublabel: `${fmtQty(r.quantity)} left${r.expiry_date ? ` · exp ${r.expiry_date}` : ""}`,
            }))
        )
      )
      .catch(() => setBatches([]));
  }, [line.item_id]);

  const itemOptions = items.map((i) => ({
    value: i.id,
    label: i.description ? `${i.item_code} · ${i.description}` : i.item_code,
    sublabel: `${fmtQty(i.quantity)} ${i.unit || ""}`.trim(),
  }));

  const lineOptions = machineLines.length ? machineLines : productionLines;

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F6F8FC] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">
          {item ? `Available ${fmtQty(item.quantity)} ${item.unit || ""}` : "Line"}
        </p>
        {removable && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-rose-600 hover:bg-rose-600/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item *</label>
          <SearchableSelect
            value={line.item_id || ""}
            onValueChange={(v) => onChange({ item_id: v, batch_number: "" })}
            options={itemOptions}
            placeholder="Select item"
            searchPlaceholder="Search packaging item..."
          />
        </div>
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Product (Product Master)</label>
          <ProductPicker
            products={products}
            value={line.product_id || ""}
            onChange={(product) => onChange({
              product_id: product?.id || "",
              product_code: product?.product_code || "",
              product_name: product?.product_name || "",
            })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Qty {item?.unit ? `(${item.unit})` : ""} *</label>
          <Input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} placeholder="0" className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Batch Used</label>
          <SearchableSelect
            value={line.batch_number || ""}
            onValueChange={(v) => onChange({ batch_number: v })}
            options={batches}
            placeholder={line.item_id ? "Select batch in stock..." : "Pick item first"}
            searchPlaceholder="Search batch..."
            allowCustom
            clearable
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Production Order</label>
          <SearchableSelect
            value={line.production_order || ""}
            onValueChange={(v) => onChange({ production_order: v })}
            options={orders}
            placeholder="None"
            searchPlaceholder="Search order..."
            clearable
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Line</label>
          <SearchableSelect
            value={line.production_line || ""}
            onValueChange={(v) => onChange({ production_line: v })}
            options={lineOptions}
            placeholder="None"
            searchPlaceholder="Search line..."
            clearable
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Remarks</label>
          <Input value={line.remarks} onChange={(e) => onChange({ remarks: e.target.value })} placeholder="Optional" className={FIELD} />
        </div>
      </div>
    </div>
  );
}
