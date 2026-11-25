import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeftRight, Boxes, Download, Package, Plus, Search, Tag, UserCheck } from "lucide-react";
import ItemCard from "@/components/packaging/ItemCard";
import ItemDialog from "@/components/packaging/ItemDialog";
import StockInDialog from "@/components/packaging/StockInDialog";
import StockUseDialog from "@/components/packaging/StockUseDialog";
import StockCheckDialog from "@/components/packaging/StockCheckDialog";
import ItemDetailDialog from "@/components/packaging/ItemDetailDialog";
import PackagingSettingsDialog from "@/components/packaging/PackagingSettingsDialog";
import { actingUserName } from "@/lib/permissions";
import { downloadCsv } from "@/lib/warehouse";
import { loadUnitOptions } from "@/lib/masterOptions";
import {
  DEFAULT_UNITS,
  canApproveStock,
  canManagePackaging,
  fmtQty,
  isLowStock,
  isPackagingStaff,
  itemStatus,
  loadPackagingSettings,
} from "@/lib/packaging";

const ITEM_CSV_COLUMNS = [
  { label: "Item Code", key: "item_code" },
  { label: "Category", key: "category" },
  { label: "Quantity", key: "quantity" },
  { label: "Unit", key: "unit" },
  { label: "Minimum Level", key: "min_level" },
  { label: "Qty per Unit", key: "qty_per_unit" },
];

export default function PackagingStock() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [settings, setSettings] = useState({ id: "", categories: [], threshold: 0 });
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("all");
  const [itemDialog, setItemDialog] = useState({ open: false, item: null });
  const [inItem, setInItem] = useState(null);
  const [useItem, setUseItem] = useState(null);
  const [checkItem, setCheckItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [itemRows, approvalPage, loadedSettings] = await Promise.all([
        base44.entities.PackagingItem.list("-created_date", 2000),
        base44.entities.PackagingApproval.filter({ status: "Pending" }, { limit: 500 }).catch(() => ({ items: [] })),
        loadPackagingSettings().catch(() => ({ id: "", categories: [], threshold: 0 })),
      ]);
      const allItems = Array.isArray(itemRows) ? itemRows : itemRows?.items || [];
      setItems(allItems.filter((i) => i.active !== false && !i.deleted));
      setPendingIds(new Set((approvalPage?.items || []).map((a) => a.item_id)));
      setSettings(loadedSettings);
    } catch (e) {
      toast({ title: "Could not load packaging stock", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadUnitOptions().then((opts) => setUnits(opts.map((o) => o.value))).catch(() => {});
    const unsub = base44.entities.PackagingItem.subscribe?.(() => load(true));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const audit = async (action, recordId, details) => {
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        user_name: actingUserName(user),
        module: "Packaging Stock",
        action,
        record_id: recordId,
        details,
      });
    } catch {
      // The stock action itself must not fail because of the audit trail.
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const history = await base44.entities.PackagingMovement.filter({ item_id: deleting.id }, { limit: 1 });
      if ((history.items || []).length) {
        await base44.entities.PackagingItem.update(deleting.id, { active: false });
        toast({ title: "Item removed", description: `${deleting.description || deleting.item_code} deactivated (movement history preserved).` });
        await audit("Updated", deleting.id, `Deactivated ${deleting.item_code} (has movement history)`);
      } else {
        await base44.entities.PackagingItem.delete(deleting.id);
        toast({ title: "Item deleted", description: `${deleting.description || deleting.item_code} removed.` });
        await audit("Deleted", deleting.id, `Deleted ${deleting.item_code}`);
      }
      setDeleting(null);
      load();
    } catch (e) {
      toast({ title: "Could not remove item", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const allCategories = [...new Set([...(settings.categories || []), ...items.map((i) => i.category).filter(Boolean)])];

  const visible = items.filter((item) => {
    if (mode === "low" && !isLowStock(item)) return false;
    if (category !== "all" && item.category !== category) return false;
    const term = search.trim().toLowerCase();
    if (term && ![item.item_code, item.description, item.name, item.category, item.supplier].some((v) => (v || "").toLowerCase().includes(term))) return false;
    return true;
  });

  const lowCount = items.filter(isLowStock).length;
  const totalUnits = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-5">
      {/* Header (Matches Picture 13: Stock Counter) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-2xl font-bold tracking-tight">Stock Counter</h2>
          <p className="text-[#64748B] text-xs mt-0.5">Track inventory, usage, and low-stock alerts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/packaging-approvals"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F294A] hover:bg-[#F1F5F9]"
          >
            <UserCheck className="w-3.5 h-3.5" /> Approvals
          </Link>
          {isPackagingStaff(user) && (
            <Button
              size="sm"
              onClick={() => setItemDialog({ open: true, item: null })}
              className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          )}
          {canManagePackaging(user) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-9 border-[#E2E8F0] bg-white text-[#0F294A] hover:bg-[#F1F5F9] text-xs"
            >
              <Tag className="w-3.5 h-3.5 mr-1" /> Categories
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadCsv(`packaging-stock-${new Date().toISOString().slice(0, 10)}.csv`, ITEM_CSV_COLUMNS, visible)}
            className="h-9 border-[#E2E8F0] bg-white text-[#0F294A] hover:bg-[#F1F5F9] text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
          <Link
            to="/packaging-movements"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#0F294A] hover:bg-[#F1F5F9]"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Movements
          </Link>
        </div>
      </div>

      {/* 3 KPI Summary Cards (Matches Picture 13) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl text-[#0F294A] font-bold leading-none">{items.length}</p>
            <p className="text-xs text-[#64748B] mt-1">Total Items</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl text-[#0F294A] font-bold leading-none">{lowCount}</p>
            <p className="text-xs text-[#64748B] mt-1">Low Stock</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl text-[#0F294A] font-bold leading-none">{fmtQty(totalUnits)}</p>
            <p className="text-xs text-[#64748B] mt-1">Total Units</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="pl-9 h-10 bg-white border-[#E2E8F0] text-[#0F294A]"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-44 h-10 bg-white border-[#E2E8F0] text-[#0F294A]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={mode === "all" ? "default" : "outline"}
            onClick={() => setMode("all")}
            className={
              mode === "all"
                ? "h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                : "h-10 px-4 border-[#E2E8F0] bg-white text-[#0F294A] hover:bg-[#F1F5F9]"
            }
          >
            All
          </Button>
          <Button
            size="sm"
            variant={mode === "low" ? "default" : "outline"}
            onClick={() => setMode("low")}
            className={
              mode === "low"
                ? "h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                : "h-10 px-4 border-[#E2E8F0] bg-white text-[#0F294A] hover:bg-[#F1F5F9]"
            }
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Low Stock
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-10 text-center">
          <Boxes className="w-8 h-8 text-[#3a465c] mx-auto" />
          <p className="text-[#64748B] text-sm mt-3">
            {items.length === 0 ? "No packaging items yet — add your first item to start tracking stock." : "No items match these filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              status={itemStatus(item, pendingIds.has(item.id))}
              canEdit={isPackagingStaff(user)}
              canDelete={canApproveStock(user) || isPackagingStaff(user)}
              onIn={() => setInItem(item)}
              onUse={() => setUseItem(item)}
              onCheck={() => setCheckItem(item)}
              onEdit={() => setItemDialog({ open: true, item })}
              onDelete={() => setDeleting(item)}
              onDetail={() => setDetailItem(item)}
            />
          ))}
        </div>
      )}

      <ItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        categories={allCategories}
        units={units}
        onClose={() => setItemDialog({ open: false, item: null })}
        onSaved={(saved) => {
          const wasEdit = !!itemDialog.item;
          if (saved?.id) {
            setItems((prev) => {
              const filtered = prev.filter((row) => row.id !== saved.id);
              return saved.active !== false && !saved.deleted ? [saved, ...filtered] : filtered;
            });
            toast({ title: wasEdit ? "Item updated" : "Item added", description: `${saved.description || saved.item_code} saved to packaging stock.` });
          }
          load(true);
        }}
      />
      <StockInDialog open={!!inItem} item={inItem} items={items} user={user} onClose={() => setInItem(null)} onSaved={load} />
      <StockUseDialog
        open={!!useItem}
        item={useItem}
        user={user}
        threshold={settings.threshold}
        onClose={() => setUseItem(null)}
        onSaved={(result) => {
          load();
          if (result?.approval) toast({ title: "Sent for approval", description: "This issue is above the approval threshold." });
        }}
      />
      <StockCheckDialog
        open={!!checkItem}
        item={checkItem}
        user={user}
        onClose={() => setCheckItem(null)}
        onSaved={() => {
          load();
          toast({ title: "Adjustment requested", description: "A supervisor will review the counted difference." });
        }}
      />
      <ItemDetailDialog open={!!detailItem} item={detailItem} onClose={() => setDetailItem(null)} />
      <PackagingSettingsDialog
        open={settingsOpen}
        updatedBy={actingUserName(user)}
        onClose={() => setSettingsOpen(false)}
        onSaved={load}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A]">Remove {deleting?.description || deleting?.item_code}?</DialogTitle>
            <DialogDescription className="text-[#64748B] text-sm">
              An item with movement history is deactivated instead of deleted, so past movements stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleting(null)} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Cancel</Button>
            <Button type="button" onClick={remove} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold">
              {busy ? "Working..." : "Remove item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
