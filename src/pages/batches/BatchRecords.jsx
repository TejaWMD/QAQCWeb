import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, Pencil, Printer, Search, Trash2 } from "lucide-react";
import LabelPrintSheet from "@/components/labels/LabelPrintSheet";
import ReprintDialog from "@/components/labels/ReprintDialog";
import { barcodeImageUrl, batchQrPayload, fmtDay, layoutOfRecord, loadBatchRecords, logLabelAudit, qrImageUrl } from "@/lib/labels";
import { fmtQty } from "@/lib/production";
import { actingUserName } from "@/lib/permissions";
import { downloadCsv, todayStr } from "@/lib/warehouse";
import { inputClass, subtleButton, panelClass } from "@/components/planning/styles";

function statusOfBatch(record) {
  const raw = String(record?.status || "").trim();
  if (raw && raw.toLowerCase() !== "active") {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  const exp = String(record?.expiry_date || "").slice(0, 10);
  if (exp && exp < todayStr()) return "Expired";
  return "Active";
}

export default function BatchRecords() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reprintTarget, setReprintTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ quantity_cartons: "", production_date: "", expiry_date: "", status: "Active" });
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);

  const reload = useCallback(async () => {
    const rows = await loadBatchRecords();
    setRecords(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return records.filter((r) => {
      const st = statusOfBatch(r);
      if (statusFilter !== "all" && st.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (!needle) return true;
      return [r.product_name, r.product_code, r.batch_number, r.machine, r.created_by_name, r.order_number].some((value) =>
        (value || "").toLowerCase().includes(needle)
      );
    });
  }, [records, term, statusFilter]);

  const exportCsv = () => {
    downloadCsv(
      `batch-records-${todayStr()}.csv`,
      [
        { label: "Product Name", value: (r) => r.product_name },
        { label: "Product Code", value: (r) => r.product_code },
        { label: "Batch Number", value: (r) => r.batch_number },
        { label: "Production Date", value: (r) => fmtDay(r.production_date) },
        { label: "Expiry Date", value: (r) => fmtDay(r.expiry_date) },
        { label: "Qty (Cartons)", value: (r) => r.quantity_cartons },
        { label: "Status", value: (r) => statusOfBatch(r) },
      ],
      rows
    );
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`Delete batch record "${record.batch_number}" (${record.product_name})?`)) return;
    try {
      await base44.entities.BatchRecord.delete(record.id);
      await logLabelAudit({
        user,
        action: "Deleted",
        recordId: record.id,
        details: `Deleted batch ${record.batch_number} (${record.product_name})`,
      });
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      toast({ title: "Batch deleted", description: `${record.batch_number} removed.` });
    } catch (e) {
      toast({ title: "Could not delete batch", description: e?.message || "Please try again.", variant: "destructive" });
    }
  };

  const openEdit = (record) => {
    setEditTarget(record);
    setEditForm({
      quantity_cartons: record.quantity_cartons ?? "",
      production_date: String(record.production_date || "").slice(0, 10),
      expiry_date: String(record.expiry_date || "").slice(0, 10),
      status: statusOfBatch(record),
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      const patch = {
        quantity_cartons: Number(editForm.quantity_cartons) || 0,
        production_date: editForm.production_date,
        expiry_date: editForm.expiry_date,
        status: editForm.status,
      };
      const updated = await base44.entities.BatchRecord.update(editTarget.id, patch);
      await logLabelAudit({
        user,
        action: "Updated",
        recordId: editTarget.id,
        details: `Updated batch ${editTarget.batch_number} (${editTarget.product_name})`,
      });
      setRecords((prev) => prev.map((r) => (r.id === editTarget.id ? { ...r, ...patch, ...(updated || {}) } : r)));
      setEditTarget(null);
      toast({ title: "Batch updated", description: `${editTarget.batch_number} saved.` });
    } catch (e) {
      toast({ title: "Update failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const reprint = async (copies) => {
    if (!reprintTarget) return;
    setBusy(true);
    try {
      const entry = { user_name: actingUserName(user), user_id: user?.id || "", date: new Date().toISOString(), copies };
      const reprints = [...(reprintTarget.reprints || []), entry];
      const nextPrintCount = (Number(reprintTarget.print_count) || 0) + copies;
      await base44.entities.BatchRecord.update(reprintTarget.id, { reprints, print_count: nextPrintCount });
      await logLabelAudit({
        user,
        action: "Reprinted",
        recordId: reprintTarget.id,
        details: `Batch ${reprintTarget.batch_number} reprinted for ${reprintTarget.product_name} · ${copies} label(s)`,
      });
      setRecords((list) => list.map((r) => (r.id === reprintTarget.id ? { ...r, reprints, print_count: nextPrintCount } : r)));
      setJob({
        layout: layoutOfRecord(reprintTarget),
        copies,
        data: {
          productName: reprintTarget.product_name,
          cartonDescription: reprintTarget.carton_description || reprintTarget.product_name,
          productCode: reprintTarget.product_code,
          batchNumber: reprintTarget.batch_number,
          productionDate: reprintTarget.production_date,
          expiryDate: reprintTarget.expiry_date,
          cartonBarcode: reprintTarget.carton_barcode || reprintTarget.batch_number,
          pcsPerCarton: reprintTarget.pcs_per_carton || 24,
        },
      });
      toast({ title: "Reprint logged", description: `${reprintTarget.batch_number} · ${copies} label(s)` });
      setReprintTarget(null);
    } catch (e) {
      toast({ title: "Could not reprint", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-xl font-bold">All Batches</h2>
          <p className="text-[#64748B] text-sm mt-0.5">View and manage all stock batches</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setJob(null);
              setTimeout(() => window.print(), 50);
            }}
            className={subtleButton}
            disabled={rows.length === 0}
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print List
          </Button>
          <Button variant="outline" onClick={exportCsv} className={subtleButton} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Search & Status Filter Bar (Matches Picture 9) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by product or batch number..."
            className={`${inputClass} pl-9 h-10 bg-white`}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-10 bg-white border-[#E2E8F0] text-[#0F294A]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
        </div>
      ) : (
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="text-left font-semibold px-4 py-3">Product Name</th>
                <th className="text-left font-semibold px-4 py-3">Batch Number</th>
                <th className="text-left font-semibold px-4 py-3">Production Date</th>
                <th className="text-left font-semibold px-4 py-3">Expiry Date</th>
                <th className="text-center font-semibold px-4 py-3">Qty (Cartons)</th>
                <th className="text-center font-semibold px-4 py-3">Status</th>
                <th className="text-right font-semibold px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#64748B]">
                    {records.length === 0 ? "No batches recorded yet." : "No batch matches this search."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const st = statusOfBatch(r);
                  const isActive = st === "Active";
                  return (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-semibold text-[#0F294A]">
                        {r.product_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#334155] whitespace-nowrap">
                        {r.batch_number}
                      </td>
                      <td className="px-4 py-3 text-[#475569] whitespace-nowrap">
                        {fmtDay(r.production_date)}
                      </td>
                      <td className="px-4 py-3 text-[#475569] whitespace-nowrap">
                        {fmtDay(r.expiry_date)}
                      </td>
                      <td className="px-4 py-3 text-center text-[#0F294A] font-medium">
                        {fmtQty(r.quantity_cartons)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {st}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewTarget(r)}
                            className="p-1.5 rounded text-[#334155] hover:text-[#1D4ED8] hover:bg-[#EBF3FF]"
                            title="View batch label"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="p-1.5 rounded text-[#334155] hover:text-[#1D4ED8] hover:bg-[#EBF3FF]"
                            title="Edit batch"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setReprintTarget(r)}
                            className="p-1.5 rounded text-[#334155] hover:text-[#1D4ED8] hover:bg-[#EBF3FF]"
                            title="Print batch label"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="p-1.5 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Delete batch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[#64748B]">
        {rows.length} of {records.length} batch record(s)
      </p>

      {/* View Batch Label Modal */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A]">Batch {viewTarget?.batch_number}</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <div
                data-logo-badge="true"
                style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
                className="rounded-xl border border-slate-200 p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-sm">{viewTarget.product_name}</p>
                    <p className="font-medium text-slate-600">{viewTarget.product_code}</p>
                    <p className="font-bold">{viewTarget.batch_number}</p>
                    <p className="text-slate-600">Prod: {fmtDay(viewTarget.production_date)}</p>
                    <p className="text-slate-600">Exp: {fmtDay(viewTarget.expiry_date)}</p>
                    <p className="text-slate-600">{viewTarget.pcs_per_carton || 24} pcs/carton · {fmtQty(viewTarget.quantity_cartons)} cartons</p>
                  </div>
                  <img
                    src={qrImageUrl(
                      batchQrPayload({
                        productCode: viewTarget.product_code,
                        productName: viewTarget.product_name,
                        cartonDescription: viewTarget.carton_description || viewTarget.product_name,
                        batchNumber: viewTarget.batch_number,
                        expiryDate: viewTarget.expiry_date,
                        cartonBarcode: viewTarget.carton_barcode,
                      }),
                      viewTarget.qr_ecc || "M"
                    )}
                    alt="QR"
                    className="w-20 h-20 shrink-0"
                  />
                </div>
                <div className="pt-1 text-center">
                  <img
                    src={barcodeImageUrl(viewTarget.carton_barcode || viewTarget.batch_number)}
                    alt="Barcode"
                    className="w-full h-10 object-contain"
                  />
                  <p className="text-[11px] font-mono">{viewTarget.carton_barcode || viewTarget.batch_number}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <Link
                  to={`/traceability?batch=${encodeURIComponent(viewTarget.batch_number)}`}
                  className="text-[#2563EB] hover:underline font-medium"
                >
                  Open full traceability →
                </Link>
                <Button
                  size="sm"
                  onClick={() => {
                    const target = viewTarget;
                    setViewTarget(null);
                    setReprintTarget(target);
                  }}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Labels
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Batch Modal */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A]">Edit Batch {editTarget?.batch_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64748B]">Qty (Cartons)</label>
              <Input
                type="number"
                min="0"
                value={editForm.quantity_cartons}
                onChange={(e) => setEditForm({ ...editForm, quantity_cartons: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64748B]">Production Date</label>
                <Input
                  type="date"
                  value={editForm.production_date}
                  onChange={(e) => setEditForm({ ...editForm, production_date: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64748B]">Expiry Date</label>
                <Input
                  type="date"
                  value={editForm.expiry_date}
                  onChange={(e) => setEditForm({ ...editForm, expiry_date: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64748B]">Status</label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={busy} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white">
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReprintDialog
        open={!!reprintTarget}
        record={reprintTarget}
        busy={busy}
        onClose={() => setReprintTarget(null)}
        onConfirm={reprint}
      />

      <LabelPrintSheet job={job} onDone={() => setJob(null)} />
    </div>
  );
}
