import React from "react";
import { Input } from "@/components/ui/input";

export default function WastageGroupTable({ title, components, form, set }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 bg-slate-100 text-xs font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200">
          {title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Component</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 w-28">Used</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 w-28">Wasted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {components.map((c) => {
              const usedVal = form[`${c.key}_used`];
              const wasteVal = form[`${c.key}_waste`];
              return (
                <tr key={c.key}>
                  <td className="px-3 py-1.5 text-slate-700 min-w-[140px]">{c.label}</td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      value={usedVal === 0 || usedVal === "" || usedVal == null ? "" : usedVal}
                      onChange={(e) => set(`${c.key}_used`, e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-8 text-right min-w-[80px]"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      value={wasteVal === 0 || wasteVal === "" || wasteVal == null ? "" : wasteVal}
                      onChange={(e) => set(`${c.key}_waste`, e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-8 text-right min-w-[80px]"
                      placeholder="0"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}