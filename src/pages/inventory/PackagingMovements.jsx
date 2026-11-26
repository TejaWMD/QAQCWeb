import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { MOVEMENT_CSV_COLUMNS, MOVEMENT_TYPES, fmtQty, loadPackagingSettings } from "@/lib/packaging";
import { downloadCsv } from "@/lib/warehouse";
import { fmtDay } from "@/lib/labels";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";
const EMPTY = { from: "", to: "", item: "all", category: "all", type: "all", user: "all" };

const TYPE_STYLES = {
  In: "text-emerald-700",
  Use: "text-[#1D4ED8]",
  Adjustment: "text-amber-700",
};

const buildQuery = (f) => {
  const query = {};
  const range = {};
  if (f.from) range.$gte = f.from;
  if (f.to) range.$lte = f.to;
  if (Object.keys(range).length) query.movement_date = range;
  if (f.item !== "all") query.item_id = f.item;
  if (f.category !== "all") query.category = f.category;
  if (f.type !== "all") query.type = f.type;
  if (f.user !== "all") query.user_name = f.user;
  return query;
};

export default function PackagingMovements({ embedded = false }) {
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const [itemRows, settings] = await Promise.all([
        base44.entities.PackagingItem.list("item_code", 500),
        loadPackagingSettings(),
      ]);
      setItems(Array.isArray(itemRows) ? itemRows : []);
      setCategories(settings.categories);
      try {
        const distinct = await base44.entities.PackagingMovement.list({ distinct: "user_name" });
        setUsers((distinct.items || []).filter(Boolean));
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const page = await base44.entities.PackagingMovement.filter(buildQuery(filters), { sort: "-created_date", limit: 100 });
        if (!alive) return;
        setRows(page.items || []);
        setCursor(page.next_cursor || null);
        setHasMore(!!page.has_more);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [filters]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await base44.entities.PackagingMovement.filter(buildQuery(filters), { sort: "-created_date", limit: 100, cursor });
      setRows((prev) => [...prev, ...(page.items || [])]);
      setCursor(page.next_cursor || null);
      setHasMore(!!page.has_more);
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const page = await base44.entities.PackagingMovement.filter(buildQuery(filters), { sort: "-created_date", limit: 1000 });
      downloadCsv(`stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, MOVEMENT_CSV_COLUMNS, page.items || []);
    } finally {
      setExporting(false);
    }
  };

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className={embedded ? "space-y-4" : "min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!embedded ? (
          <h2 className="text-[#0F294A] text-lg font-semibold">Stock Movements</h2>
        ) : (
          <p className="text-xs text-[#64748B]">{loading ? "Loading…" : `${rows.length} movements`}</p>
        )}
        <Button onClick={exportCsv} disabled={exporting} size="sm" variant="outline" className="border-[#E2E8F0] bg-white text-[#0F294A] hover:bg-[#F1F5F9]">
          <Download className="w-3.5 h-3.5 mr-1.5" /> {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className={FIELD} />
        <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className={FIELD} />
        <Select value={filters.item} onValueChange={(v) => set("item", v)}>
          <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All items</SelectItem>
            {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.item_code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => set("category", v)}>
          <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={(v) => set("type", v)}>
          <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {MOVEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.user} onValueChange={(v) => set("user", v)}>
          <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B]">Date</TableHead>
                <TableHead className="text-[#64748B]">Item</TableHead>
                <TableHead className="text-[#64748B]">Type</TableHead>
                <TableHead className="text-[#64748B] text-right">Qty</TableHead>
                <TableHead className="text-[#64748B]">Batch</TableHead>
                <TableHead className="text-[#64748B]">Rack</TableHead>
                <TableHead className="text-[#64748B]">Order</TableHead>
                <TableHead className="text-[#64748B]">User</TableHead>
                <TableHead className="text-[#64748B]">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-[#64748B] text-center py-6">No movements.</TableCell></TableRow>
              )}
              {rows.map((m) => (
                <TableRow key={m.id} className="border-[#E2E8F0] hover:bg-[#F1F5F9]">
                  <TableCell className="text-[#64748B] whitespace-nowrap">{fmtDay(m.movement_date || m.created_date)}</TableCell>
                  <TableCell className="text-[#0F294A] whitespace-nowrap">{m.item_code}</TableCell>
                  <TableCell className={`font-medium whitespace-nowrap ${TYPE_STYLES[m.type] || "text-[#64748B]"}`}>{m.type}</TableCell>
                  <TableCell className="text-right text-[#0F294A] whitespace-nowrap">
                    {m.type === "Adjustment" && Number(m.quantity) > 0 ? "+" : ""}
                    {fmtQty(m.quantity)} <span className="text-[#64748B]">{m.unit}</span>
                  </TableCell>
                  <TableCell className="text-[#64748B] whitespace-nowrap">{m.batch_number || "—"}</TableCell>
                  <TableCell className="text-[#64748B] whitespace-nowrap">{m.rack_location || "—"}</TableCell>
                  <TableCell className="text-[#64748B] whitespace-nowrap">{m.production_order || "—"}</TableCell>
                  <TableCell className="text-[#64748B] whitespace-nowrap">{m.user_name || "—"}</TableCell>
                  <TableCell className="text-[#64748B] max-w-[240px] truncate" title={m.remarks}>{m.remarks || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {hasMore && (
          <div className="pt-3 text-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="border-[#E2E8F0] bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]">
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
