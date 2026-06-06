"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export function sortFilterOptions(
  options: SearchableSelectOption[]
): SearchableSelectOption[] {
  const allOption = options.find((o) => o.value === "all");
  const rest = options
    .filter((o) => o.value !== "all")
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  return allOption ? [allOption, ...rest] : rest;
}

export function SearchableFilterSelect({
  label,
  value,
  onValueChange,
  options,
  compact,
  triggerClassName,
  placeholder = "Search…",
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  compact?: boolean;
  triggerClassName?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sortedOptions = useMemo(() => sortFilterOptions(options), [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedOptions;
    return sortedOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [sortedOptions, query]);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? "Select…";

  return (
    <div>
      <Label className={compact ? "text-[10px]" : undefined}>{label}</Label>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "mt-1 w-full justify-between font-normal",
              compact && "h-8 text-xs",
              triggerClassName
            )}
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 p-0">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="h-8 pl-7 text-xs"
                autoFocus
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate">No matches</p>
            ) : (
              filteredOptions.map((o) => {
                const selected = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onValueChange(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      selected
                        ? "bg-warm-sand text-ink"
                        : "hover:bg-warm-sand/50"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-teal",
                        selected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
