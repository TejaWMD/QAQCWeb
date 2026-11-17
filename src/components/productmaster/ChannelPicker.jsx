import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { inputClass, subtleButton } from "@/components/planning/styles";

// Customers / channels the product is sold through; the same product can carry
// more than one channel.
export default function ChannelPicker({ value = [], onChange, options = [], disabled }) {
  const [draft, setDraft] = useState("");
  const selected = value || [];

  const add = (name) => {
    const clean = (name || "").trim();
    if (!clean || selected.some((row) => row.toLowerCase() === clean.toLowerCase())) return;
    onChange([...selected, clean]);
    setDraft("");
  };

  const remove = (name) => onChange(selected.filter((row) => row !== name));

  const available = options.filter((name) => !selected.some((row) => row.toLowerCase() === name.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && <span className="text-xs text-[#64748B]">No channel set.</span>}
        {selected.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#EBF3FF] text-[#1D4ED8] border border-[#BFD7FF]">
            {name}
            {!disabled && (
              <button type="button" onClick={() => remove(name)} className="hover:text-[#0F294A]">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
            placeholder="Type a customer or channel"
            className={`${inputClass} sm:max-w-[240px]`}
            list="channel-options"
          />
          <datalist id="channel-options">
            {available.map((name) => <option key={name} value={name} />)}
          </datalist>
          <Button variant="outline" onClick={() => add(draft)} disabled={!draft.trim()} className={subtleButton}>
            <Plus className="w-4 h-4 mr-1.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}