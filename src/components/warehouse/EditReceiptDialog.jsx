import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { actingUserName } from "@/lib/permissions";
import { canEditReceipt, eventStamp } from "@/lib/warehouse";
import {
  loadBatchOptions,
  loadProductOptions,
  loadPurchaseOrderOptions,
  loadSupplierOptions,
} from "@/lib/masterOptions";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

const FIELDS = [
  ["item_code", "Item Code"],
  ["product_description", "Description"],
  ["batch_number", "Batch Number"],
  ["quantity", "Quantity"],
  ["unit", "Unit"],
  ["rack_location", "Rack"],
  ["expiry_date", "Expiry Date"],
  ["supplier", "Supplier"],
  ["delivery_note", "Delivery Note"],
  ["remarks", "Remarks"],
];

// Edits one received line. Every edit is written to the Audit Trail.
export default function EditReceiptDialog({ record, user, units, racks, onClose, onSaved }) {
  const [values, setValues] = useState({ ...record });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState({ items: [], batches: [], suppliers: [], pos: [] });
  const editable = canEditReceipt(user, record);

  useEffect(() => {
    Promise.all([
      base44.entities.WarehouseItem.list("-created_date", 500).catch(() => []),
      loadProductOptions(),
      loadBatchOptions(),
      loadSupplierOptions(),
      loadPurchaseOrderOptions(),
    ]).then(([whRows, products, batches, suppliers, pos]) => {
      const wh = Array.isArray(whRows) ? whRows : whRows?.items || [];
      const items = [
        ...wh.map((i) => ({ value: i.item_code, label: i.description ? `${i.item_code} — ${i.description}` : i.item_code, description: i.description })),
        ...products.map((p) => ({ value: p.product_code, label: `${p.product_code} — ${p.product_name}`, description: p.product_name })),
      ];
      setOpts({ items, batches, suppliers, pos });
    });
  }, []);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const save = async () => {
    if (!editable) return setError("This entry is past its 24-hour edit window. Ask a supervisor to change it.");
    if (!(Number(values.quantity) > 0)) return setError("Quantity must be greater than zero.");
    setSaving(true);
    setError("");
    try {
      const page = await base44.entities.GoodsReceipt.filter(
        { date_received: values.date_received, batch_number: values.batch_number },
        { limit: 20 }
      );
      const clash = (page.items || []).find(
        (r) => r.id !== record.id && (r.item_code || "").toLowerCase() === (values.item_code || "").toLowerCase()
      );
      if (clash) throw new Error("This item code and batch number was already received today.");

      const changed = FIELDS.filter(([key]) => String(record[key] ?? "") !== String(values[key] ?? "")).map(([, label]) => label);
      const payload = {
        item_code: values.item_code,
        product_description: values.product_description,
        batch_number: values.batch_number,
        quantity: Number(values.quantity),
        unit: values.unit,
        rack_location: values.rack_location,
        expiry_date: values.expiry_date,
        supplier: values.supplier,
        delivery_note: values.delivery_note,
        remarks: values.remarks,
        edited_by: actingUserName(user),
        edited_date: new Date().toISOString(),
      };
      await base44.entities.GoodsReceipt.update(record.id, payload);
      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Warehouse Goods Tracker",
          action: "Updated",
          record_id: record.id,
          details: changed.length
            ? `Edited received goods ${values.item_code} / batch ${values.batch_number}: ${changed.join(", ")}`
            : `Edited received goods ${values.item_code} / batch ${values.batch_number} (no field changed)`,
          old_value: `${record.quantity ?? ""} ${record.unit || ""}`.trim(),
          new_value: `${values.quantity ?? ""} ${values.unit || ""}`.trim(),
        });
      } catch {
        // An audit write must never block the edit itself.
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save the changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Edit received goods</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            {record.item_code} · batch {record.batch_number} · received {record.date_received}
          </DialogDescription>
        </DialogHeader>

        {!editable && (
          <p className="text-xs text-amber-700">
            The 24-hour edit window for this entry has closed. Only an Admin or Warehouse Supervisor can change it.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Item Code</label>
            <SearchableSelect
              value={values.item_code || ""}
              onValueChange={(v) => {
                const match = opts.items.find((i) => i.value === v);
                setValues((prev) => ({
                  ...prev,
                  item_code: v,
                  ...(match?.description ? { product_description: match.description } : {}),
                }));
              }}
              options={opts.items}
              placeholder="Select item code..."
              searchPlaceholder="Search item..."
              allowCustom
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Description</label>
            <Input value={values.product_description || ""} onChange={(e) => set("product_description", e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Batch Number</label>
            <SearchableSelect
              value={values.batch_number || ""}
              onValueChange={(v) => set("batch_number", v)}
              options={opts.batches}
              placeholder="Select batch..."
              searchPlaceholder="Search batch..."
              allowCustom
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Quantity</label>
            <Input type="number" min="0" step="any" value={values.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Unit</label>
            <Select value={values.unit || undefined} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger className={FIELD}><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Rack</label>
            <Select value={values.rack_location || undefined} onValueChange={(v) => set("rack_location", v)}>
              <SelectTrigger className={FIELD}><SelectValue placeholder="Select rack" /></SelectTrigger>
              <SelectContent>{racks.map((r) => <SelectItem key={r.id} value={r.rack_code}>{r.rack_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Expiry Date</label>
            <Input type="date" value={values.expiry_date || ""} onChange={(e) => set("expiry_date", e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Supplier</label>
            <SearchableSelect
              value={values.supplier || ""}
              onValueChange={(v) => set("supplier", v)}
              options={opts.suppliers}
              placeholder="Select supplier..."
              searchPlaceholder="Search supplier..."
              allowCustom
              clearable
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Delivery Note</label>
            <SearchableSelect
              value={values.delivery_note || ""}
              onValueChange={(v) => set("delivery_note", v)}
              options={opts.pos}
              placeholder="Select PO or enter DO..."
              searchPlaceholder="Search PO..."
              allowCustom
              clearable
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Remarks</label>
            <Input value={values.remarks || ""} onChange={(e) => set("remarks", e.target.value)} className={FIELD} />
          </div>
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">Cancel</Button>
          <Button onClick={save} disabled={saving || !editable} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}