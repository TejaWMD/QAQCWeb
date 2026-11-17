import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search } from "lucide-react";
import { inputClass } from "@/components/planning/styles";

// Searchable product dropdown over the Product Master.
export default function ProductPicker({ products = [], value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = products.find((p) => p.id === value) || null;

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((p) => !term || `${p.product_name} ${p.product_code}`.toLowerCase().includes(term))
      .slice(0, 60);
  }, [products, query]);

  const pick = (product) => {
    onChange(product);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-md border border-[#E2E8F0] bg-[#F6F8FC] px-3 py-2 text-sm text-left disabled:opacity-50 ${selected ? "text-[#0F294A]" : "text-[#64748B]"}`}
      >
        <span className="truncate">
          {selected ? `${selected.product_name}` : "Select a product"}
          {selected?.product_code ? <span className="text-[#64748B]"> · {selected.product_code}</span> : null}
        </span>
        <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-[#64748B]" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or code"
              className={`${inputClass} h-7 border-0 shadow-none focus-visible:ring-0 text-sm`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#64748B]">No product matches.</p>
            ) : (
              matches.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => pick(product)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F294A]"
                >
                  <span className="truncate">
                    {product.product_name}
                    <span className="text-[10px] text-[#64748B] ml-1.5">{product.product_code}</span>
                  </span>
                  {product.id === value && <Check className="w-3.5 h-3.5 text-[#1D4ED8]" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}