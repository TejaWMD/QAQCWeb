import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

function normalizeOptions(options = []) {
  const seen = new Set();
  const list = [];
  for (const opt of options) {
    if (!opt) continue;
    const item =
      typeof opt === "string"
        ? { value: opt, label: opt }
        : {
            value: String(opt.value ?? ""),
            label: String(opt.label ?? opt.value ?? ""),
            sublabel: opt.sublabel ? String(opt.sublabel) : undefined,
          };
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    list.push(item);
  }
  return list;
}

/**
 * Searchable dropdown backed by Popover + Command.
 * - Preserves any existing `value` even if it isn't in `options` (legacy records).
 * - Set `allowCustom` only when ad-hoc values (like new vendor lot numbers) should also be allowed.
 */
export function SearchableSelect({
  options = [],
  value = "",
  onValueChange = undefined,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No matches found.",
  allowCustom = false,
  clearable = false,
  disabled = false,
  className = "",
  id = undefined,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const normalized = React.useMemo(() => normalizeOptions(options), [options]);
  const selected = React.useMemo(
    () => normalized.find((o) => o.value === value),
    [normalized, value]
  );

  const trimmedQuery = query.trim();
  const hasExactMatch = normalized.some(
    (o) =>
      o.value.toLowerCase() === trimmedQuery.toLowerCase() ||
      o.label.toLowerCase() === trimmedQuery.toLowerCase()
  );

  const pick = (nextVal) => {
    onValueChange?.(nextVal);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9 px-3 bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F8FAFC] hover:text-[#0F294A]",
            !value && "text-[#64748B]",
            className
          )}
        >
          <span className="truncate text-left flex-1">
            {selected ? selected.label : value || placeholder}
          </span>
          <span className="flex items-center gap-1 ml-2 shrink-0">
            {clearable && value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange?.("");
                }}
                className="rounded p-0.5 text-[#94A3B8] hover:text-[#0F294A] hover:bg-[#E2E8F0]/60"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[240px] p-0 bg-white border-[#E2E8F0] text-[#0F294A] shadow-lg"
      >
        <Command shouldFilter>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            className="text-[#0F294A]"
          />
          <CommandList
            onWheel={(e) => e.stopPropagation()}
            className="max-h-60 overflow-y-auto"
          >
            <CommandEmpty className="py-4 text-center text-xs text-[#64748B]">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {normalized.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value} ${opt.sublabel || ""}`}
                  onSelect={() => pick(opt.value)}
                  className="text-[#0F294A] cursor-pointer aria-selected:bg-[#EBF3FF] aria-selected:text-[#0F294A]"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5 shrink-0 text-[#1D4ED8]",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="truncate text-[11px] text-[#64748B]">
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
              {allowCustom && trimmedQuery && !hasExactMatch && (
                <CommandItem
                  value={`__custom__${trimmedQuery}`}
                  onSelect={() => pick(trimmedQuery)}
                  className="text-[#1D4ED8] cursor-pointer aria-selected:bg-[#EBF3FF]"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-sm">Use "{trimmedQuery}"</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
