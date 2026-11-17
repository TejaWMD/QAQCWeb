import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import ItemForm from "@/components/warehouse/ItemForm";

// The warehouse item list: code, description, unit and category. Staff can add items.
export default function ItemListDialog({ items, units, onClose, onChanged }) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const term = search.trim().toLowerCase();
  const filtered = items.filter((i) =>
    !term || `${i.item_code || ""} ${i.description || ""}`.toLowerCase().includes(term)
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Item list</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            Codes here auto-fill the product description on the receiving form.
          </DialogDescription>
        </DialogHeader>

        {adding ? (
          <ItemForm
            units={units}
            onSaved={() => { setAdding(false); onChanged?.(); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search code or description"
                  className="pl-9 bg-white border-[#E2E8F0] text-[#0F294A]"
                />
              </div>
              <Button onClick={() => setAdding(true)} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
                <Plus className="w-4 h-4" /> Add item
              </Button>
            </div>

            <div className="divide-y divide-[#1e2740] rounded-lg border border-[#E2E8F0]">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-[#64748B]">No items yet.</p>
              )}
              {filtered.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span className="text-sm font-medium text-[#0F294A]">{item.item_code}</span>
                  <span className="text-sm text-[#64748B] flex-1 min-w-0 truncate">{item.description || "—"}</span>
                  <Badge variant="outline" className="border-[#E2E8F0] text-[#64748B]">{item.unit || "—"}</Badge>
                  <Badge variant="outline" className="border-[#E2E8F0] text-[#64748B]">{item.category || "—"}</Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}