import React, { useEffect, useState } from "react";
import { productService } from "@/services/productService";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import Field from "@/components/planning/Field";
import { MACHINE_STATUSES, logPlanningAudit, num } from "@/lib/planning";
import { loadMachineLocationOptions } from "@/lib/masterOptions";
import { productionLines } from "@/lib/shiftLogConstants";
import { dialogClass, inputClass, selectClass, primaryButton, subtleButton } from "@/components/planning/styles";

export default function MachineDialog({ open, onClose, machine, availableNames = [], existingNames = [], onSaved }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", location: "", capacity_cph: "", status: "Active", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    if (!open) return;
    loadMachineLocationOptions().then(setLocations).catch(() => {});
    setError("");
    setForm(
      machine
        ? { name: machine.name || "", location: machine.location || "", capacity_cph: machine.capacity_cph ?? "", status: machine.status || "Active", notes: machine.notes || "" }
        : { name: "", location: "Plant 1", capacity_cph: "", status: "Active", notes: "" }
    );
  }, [open, machine]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const trimmedName = (form.name || "").trim();
    if (!trimmedName) return setError("Select or enter the machine / production line name.");
    const currentLower = (machine?.name || "").trim().toLowerCase();
    const isDuplicate = existingNames.some((n) => {
      const lower = (n || "").trim().toLowerCase();
      return lower === trimmedName.toLowerCase() && lower !== currentLower;
    });
    if (isDuplicate) return setError(`Machine "${trimmedName}" already exists.`);
    setSaving(true);
    setError("");
    const payload = {
      name: trimmedName,
      location: form.location || "",
      capacity_cph: num(form.capacity_cph),
      status: form.status || "Active",
      notes: form.notes || "",
    };
    try {
      if (machine) {
        await productService.updateMachine(machine.id, payload);
      } else {
        await productService.createMachine(payload);
      }
      await logPlanningAudit({
        user,
        module: "Machines",
        action: machine ? "Updated" : "Created",
        recordId: payload.name,
        details: `Machine ${payload.name} — ${payload.status}, ${num(payload.capacity_cph)} cartons/hour`,
        newValue: payload.status,
      });
      toast({ title: machine ? "Machine updated" : "Machine added", description: payload.name });
      onSaved?.();
    } catch (e) {
      setError(e?.message || "Could not save the machine.");
    } finally {
      setSaving(false);
    }
  };

  const nameOptions = [...new Set([...availableNames, ...productionLines, form.name].filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`${dialogClass} max-w-lg`}>
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{machine ? `Edit ${machine.name}` : "Add Machine"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Machine / Production Line *">
            <SearchableSelect
              value={form.name}
              onValueChange={(v) => set("name", v)}
              options={nameOptions}
              placeholder="Select or enter machine / line..."
              searchPlaceholder="Search or type machine name..."
              allowCustom
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Location">
              <SearchableSelect
                value={form.location}
                onValueChange={(v) => set("location", v)}
                options={locations.length ? locations : ["Plant 1", "Plant 2"]}
                placeholder="Select location..."
                searchPlaceholder="Search or enter location..."
                allowCustom
              />
            </Field>
            <Field label="Capacity (cartons per hour)">
              <Input type="number" min="0" value={form.capacity_cph} onChange={(e) => set("capacity_cph", e.target.value)} className={inputClass} placeholder="1200" />
            </Field>
            <Field label="Status" className="sm:col-span-2">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MACHINE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="Optional" />
          </Field>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className={subtleButton}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name} className={primaryButton}>{saving ? "Saving..." : "Save machine"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}