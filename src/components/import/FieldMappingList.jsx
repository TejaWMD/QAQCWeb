import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const humanize = (key) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Maps each entity field to a CSV column (auto-matched fields first). Unmapped
// fields are simply not imported.
export default function FieldMappingList({ fields, headers, mapping, required, onChange, disabled }) {
  const requiredSet = new Set(required);
  const ordered = [...fields].sort((a, b) => (mapping[b.key] ? 1 : 0) - (mapping[a.key] ? 1 : 0));
  const mappedCount = fields.filter((f) => mapping[f.key]).length;

  const typeLabel = (f) => {
    const t = f.type || "text";
    if (t === "enum" && f.options) return `one of: ${f.options.slice(0, 4).join(" / ")}${f.options.length > 4 ? "…" : ""}`;
    if (t === "boolean") return "true / false";
    return t;
  };

  return (
    <div>
      <p className="text-xs text-[#64748B] mb-2">
        {mappedCount} of {fields.length} fields matched to columns — adjust any mapping below; unmapped fields are skipped.
      </p>
      <div className="max-h-[360px] overflow-y-auto pr-1 space-y-1.5">
        {ordered.map((f) => (
          <div key={f.key} className="grid grid-cols-1 md:grid-cols-[1fr_230px] gap-2 items-center bg-white border border-[#E2E8F0] rounded-lg px-3 py-2">
            <div className="min-w-0">
              <span className="text-sm text-[#0F294A]">{humanize(f.key)}</span>
              {requiredSet.has(f.key) && <span className="text-rose-600 ml-1" title="Required">*</span>}
              <span className="block text-[10px] text-[#64748B] truncate">{f.key} · {typeLabel(f)}</span>
            </div>
            <Select
              value={mapping[f.key] || "none"}
              onValueChange={(v) => onChange({ ...mapping, [f.key]: v === "none" ? "" : v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 bg-[#F8FAFC] border-[#E2E8F0] text-[#0F294A] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Not imported —</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}