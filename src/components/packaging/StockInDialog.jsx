import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import InLineRow from "@/components/packaging/InLineRow";
import { newGroupId, receiveStock } from "@/lib/packaging";
import { todayStr } from "@/lib/warehouse";

let seq = 0;
const blankLine = (item) => ({
  key: `in${++seq}`,
  item_id: item?.id || "",
  quantity: "",
  remarks: "",
});

export default function StockInDialog({ open, item, items, user, onClose, onSaved }) {
  const [header, setHeader] = useState({ date: todayStr() });
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLines([blankLine(item)]);
    setHeader({ date: todayStr() });
  }, [open, item]);

  const setLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!l.item_id) return setError(`Line ${i + 1}: select an item.`);
      if (!(Number(l.quantity) > 0)) return setError(`Line ${i + 1}: quantity must be greater than zero.`);
    }
    setError("");
    setSaving(true);
    const group = newGroupId("IN");
    try {
      for (const l of lines) {
        const live = await base44.entities.PackagingItem.get(l.item_id);
        await receiveStock({
          item: live,
          quantity: Number(l.quantity),
          user,
          extras: {
            movement_date: header.date,
            remarks: l.remarks,
            source: "Stock in",
            group_id: group,
          },
        });
      }
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: `${header.date}`,
        user_name: user?.full_name || user?.email || "",
        module: "Packaging Stock",
        action: "Created",
        record_id: group,
        details: `Stock in: ${lines.length} line${lines.length === 1 ? "" : "s"}`,
      }).catch(() => {});
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not save the stock in.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Stock in</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Date</label>
            <Input type="date" value={header.date} onChange={(e) => setHeader((h) => ({ ...h, date: e.target.value }))} className="bg-white border-[#E2E8F0] text-[#0F294A]" />
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <InLineRow
              key={line.key}
              line={line}
              items={items}
              onChange={(patch) => setLine(line.key, patch)}
              onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              removable={lines.length > 1}
            />
          ))}
        </div>

        <Button
          variant="outline"
          onClick={() => setLines((prev) => [...prev, blankLine(null)])}
          className="border-dashed border-[#E2E8F0] bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]"
        >
          <Plus className="w-4 h-4" /> Add line
        </Button>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Cancel</Button>
          <Button type="button" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            {saving ? "Saving..." : "Record stock in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}