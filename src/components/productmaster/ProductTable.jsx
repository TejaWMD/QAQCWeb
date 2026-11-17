import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Pencil, Trash2 } from "lucide-react";
import {
  PRODUCT_CSV_HEADERS, downloadCsv, num, productExportRow, productStatus,
} from "@/lib/productMaster";
import { inputClass, selectClass, subtleButton, panelClass } from "@/components/planning/styles";

const STATUS_STYLE = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Pending: "bg-amber-50 text-amber-700 border-amber-300",
  Inactive: "bg-[#3a4560]/20 text-[#64748B] border-[#3a4560]",
};

const dash = (value) => (value === 0 || value ? value : "—");

// The master datasheet: one row per Item Code.
export default function ProductTable({ products = [], brands = [], customers = [], canEdit, onEdit, onToggleStatus, onDelete }) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("all");

  const customerNames = useMemo(
    () => [...new Set([...customers, ...products.map((p) => p.customer).filter(Boolean)])].sort(),
    [customers, products]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products
      .filter((p) => brand === "all" || (p.brand || "") === brand)
      .filter((p) => customer === "all" || (p.customer || "") === customer)
      .filter((p) => status === "all" || productStatus(p) === status)
      .filter((p) => !needle || `${p.brand} ${p.product_code} ${p.product_name} ${p.recipe_name} ${p.barcode} ${p.carton_barcode}`.toLowerCase().includes(needle));
  }, [products, search, brand, customer, status]);

  const exportCsv = () =>
    downloadCsv("product-master.csv", PRODUCT_CSV_HEADERS, filtered.map(productExportRow));

  return (
    <div className="space-y-3">
      <div className={`${panelClass} p-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, description, recipe or barcode" className={`${inputClass} xl:col-span-2`} />
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customerNames.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} className={subtleButton} title="Export these rows">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className={`${panelClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#64748B] border-b border-[#E2E8F0]">
              <th className="text-left font-semibold px-3 py-2">Brand</th>
              <th className="text-left font-semibold px-3 py-2">Item Code</th>
              <th className="text-left font-semibold px-3 py-2">Carton Description</th>
              <th className="text-right font-semibold px-3 py-2">Pcs/Ctn</th>
              <th className="text-right font-semibold px-3 py-2">Net Wt (kg)</th>
              <th className="text-right font-semibold px-3 py-2">Net Fill</th>
              <th className="text-right font-semibold px-3 py-2">Ctn/Batch</th>
              <th className="text-left font-semibold px-3 py-2">Batch Code</th>
              <th className="text-left font-semibold px-3 py-2">Shelf Life</th>
              <th className="text-left font-semibold px-3 py-2">Customer</th>
              <th className="text-left font-semibold px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-[#64748B]">
                  {products.length === 0 ? "No products yet. Add one, or import the datasheet." : "No products match these filters."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-b border-[#E2E8F0] hover:bg-[#F1F5F9]">
                  <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{p.brand || "—"}</td>
                  <td className="px-3 py-2 text-[#0F294A] font-semibold whitespace-nowrap">{p.product_code}</td>
                  <td className="px-3 py-2 text-[#0F294A] max-w-[280px] truncate" title={p.product_name}>{p.product_name}</td>
                  <td className="px-3 py-2 text-right text-[#64748B]">{dash(num(p.carton_size))}</td>
                  <td className="px-3 py-2 text-right text-[#64748B]">{dash(num(p.net_weight_kg))}</td>
                  <td className="px-3 py-2 text-right text-[#64748B]">{dash(num(p.net_filling_kg))}</td>
                  <td className="px-3 py-2 text-right text-[#64748B]">{dash(num(p.cartons_per_batch))}</td>
                  <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{p.batch_prefix || "—"}</td>
                  <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{num(p.shelf_life_months) ? `${num(p.shelf_life_months)} mo` : "—"}</td>
                  <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{p.customer || "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onToggleStatus?.(p)}
                      title={canEdit ? "Switch Active / Inactive" : undefined}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[productStatus(p)]} ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {productStatus(p)}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => onEdit?.(p)} className="text-[#64748B] hover:text-[#1D4ED8] hover:bg-[#EBF3FF]" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete?.(p)} className="text-[#64748B] hover:text-rose-600 hover:bg-rose-600/10" title="Delete (moves to Recently Deleted)">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#64748B]">{filtered.length} of {products.length} product(s).</p>
    </div>
  );
}