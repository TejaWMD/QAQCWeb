import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

// One stock-in line: item, quantity, batch, rack, expiry.
export default function InLineRow({ line, items, racks, defaultRack, onChange, onRemove, removable }) {
  const item = items.find((i) => i.id === line.item_id);
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F6F8FC] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Line</p>
        {removable && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-rose-600 hover:bg-rose-600/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-3 space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item *</label>
          <Select
            value={line.item_id || undefined}
            onValueChange={(v) => {
              const picked = items.find((i) => i.id === v);
              onChange({ item_id: v, rack_location: line.rack_location || picked?.default_rack || defaultRack || "" });
            }}
          >
            <SelectTrigger className={FIELD}><SelectValue placeholder="Select item" /></SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.item_code} · {i.description || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Qty {item?.unit ? `(${item.unit})` : ""} *</label>
          <Input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} placeholder="0" className={FIELD} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Remarks</label>
          <Input value={line.remarks} onChange={(e) => onChange({ remarks: e.target.value })} placeholder="Optional" className={FIELD} />
        </div>
      </div>
    </div>
  );
}