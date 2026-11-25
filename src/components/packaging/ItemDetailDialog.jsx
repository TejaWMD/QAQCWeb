import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fefoBatch, fmtQty, loadItemBatches } from "@/lib/packaging";
import { fmtDay } from "@/lib/labels";

// Batch and rack breakdown for one item, with expiry dates and the FEFO pick.
export default function ItemDetailDialog({ open, item, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setLoading(true);
    loadItemBatches(item.id).then(setRows).finally(() => setLoading(false));
  }, [open, item?.id]);

  const suggested = fefoBatch(rows);
  const total = rows.reduce((s, r) => s + r.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{item?.item_code} · stock by batch &amp; rack</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            {item?.description} · {fmtQty(total)} {item?.unit || ""} across {rows.filter((r) => r.quantity > 0).length} batch location(s)
          </DialogDescription>
        </DialogHeader>

        {suggested && (
          <p className="text-[11px] text-emerald-700">
            FEFO suggestion: batch {suggested.batch_number}
            {suggested.expiry_date ? ` (expiry ${fmtDay(suggested.expiry_date)})` : ""} at rack {suggested.rack_location || "—"}
          </p>
        )}

        <div className="rounded-lg border border-[#E2E8F0] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B]">Batch</TableHead>
                <TableHead className="text-[#64748B]">Rack</TableHead>
                <TableHead className="text-[#64748B]">Expiry</TableHead>
                <TableHead className="text-[#64748B] text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-[#64748B] text-center py-4">Loading…</TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-[#64748B] text-center py-4">No movements recorded yet.</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.key} className="border-[#E2E8F0] hover:bg-[#F1F5F9]">
                  <TableCell className="text-[#0F294A]">{r.batch_number || "—"}</TableCell>
                  <TableCell className="text-[#64748B]">{r.rack_location || "—"}</TableCell>
                  <TableCell className="text-[#64748B]">{r.expiry_date ? fmtDay(r.expiry_date) : "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${r.quantity > 0 ? "text-[#0F294A]" : "text-[#64748B]"}`}>
                    {fmtQty(r.quantity)} {item?.unit || ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}