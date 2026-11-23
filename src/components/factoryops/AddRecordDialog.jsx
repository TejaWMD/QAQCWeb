import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import EvidenceUpload from "@/components/factoryops/EvidenceUpload";
import ProductPicker from "@/components/labels/ProductPicker";
import { loadProductLinkData } from "@/lib/productLinks";
import { loadMachineOptions, loadUserOptions } from "@/lib/masterOptions";

const initialValues = (fields, initialData = null) => {
  const values = {};
  fields.forEach((f) => {
    if (f.type === "file") {
      values[`${f.key}_uri`] = initialData?.[`${f.key}_uri`] || "";
      values[`${f.key}_name`] = initialData?.[`${f.key}_name`] || "";
      return;
    }
    if (f.type === "product") {
      values.product_id = initialData?.product_id || "";
      values.product_code = initialData?.product_code || "";
      values.product_name = initialData?.product_name || "";
    }
    if (initialData && initialData[f.key] !== undefined && initialData[f.key] !== null) {
      if (f.type === "date" && typeof initialData[f.key] === "string") {
        values[f.key] = initialData[f.key].slice(0, 10);
      } else {
        values[f.key] = initialData[f.key];
      }
    } else {
      values[f.key] = f.type === "checkbox" ? false : f.default !== undefined ? f.default : "";
    }
  });
  return values;
};

// Generic add/edit-record form driven by a field config: { key, label, type, options, required, showIf }
export default function AddRecordDialog({ open, onOpenChange, title, fields, initialData = null, onSubmit }) {
  const [values, setValues] = useState(() => initialValues(fields, initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState({ products: [], records: [] });
  const [users, setUsers] = useState([]);
  const [machines, setMachines] = useState([]);
  const needsLink = fields.some((f) => f.type === "product" || f.type === "batch");
  const needsUsers = fields.some((f) => f.type === "user");
  const needsLines = fields.some((f) => f.type === "line");

  useEffect(() => {
    if (open) {
      setValues(initialValues(fields, initialData));
      setError("");
    }
  }, [open, initialData]);

  useEffect(() => {
    if (!open || !needsLink || link.products.length) return;
    loadProductLinkData()
      .then((data) => setLink({ products: data.products, records: data.records }))
      .catch(() => setLink({ products: [], records: [] }));
  }, [open, needsLink, link.products.length]);

  useEffect(() => {
    if (!open || !needsUsers || users.length) return;
    loadUserOptions().then(setUsers).catch(() => setUsers([]));
  }, [open, needsUsers, users.length]);

  useEffect(() => {
    if (!open || !needsLines || machines.length) return;
    loadMachineOptions().then(setMachines).catch(() => setMachines([]));
  }, [open, needsLines, machines.length]);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const pickProduct = (product) => {
    setValues((v) => {
      const next = {
        ...v,
        product_id: product?.id || "",
        product_code: product?.product_code || "",
        product_name: product?.product_name || "",
      };
      fields.filter((f) => f.type === "batch").forEach((f) => { next[f.key] = ""; });
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const cleaned = { ...values };
      fields.forEach((f) => {
        if (f.type === "number") {
          cleaned[f.key] =
            cleaned[f.key] === "" || cleaned[f.key] === undefined || cleaned[f.key] === null
              ? null
              : Number(cleaned[f.key]);
        }
      });
      await onSubmit(cleaned);
      toast.success(initialData ? "Record updated successfully." : "Record saved successfully.");
      onOpenChange(false);
    } catch (err) {
      const msg = err?.message || "Could not save the record. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {fields.filter((f) => (f.showIf ? f.showIf(values) : true)).map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === "checkbox" ? (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox id={f.key} checked={!!values[f.key]} onCheckedChange={(c) => set(f.key, c === true)} />
                  <Label htmlFor={f.key} className="text-sm text-[#64748B] font-normal">{f.label}</Label>
                </div>
              ) : f.type === "file" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#64748B]">{f.label}</Label>
                  <EvidenceUpload
                    label=""
                    value={{ uri: values[`${f.key}_uri`], name: values[`${f.key}_name`] }}
                    onChange={(v) => { set(`${f.key}_uri`, v.uri || ""); set(`${f.key}_name`, v.name || ""); }}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={f.key} className="text-xs text-[#64748B]">{f.label}</Label>
                    {f.badge && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-700 border border-cyan-500/30 text-[10px] font-semibold">
                        {f.badge}
                      </span>
                    )}
                  </div>
                  {f.type === "product" ? (
                    <ProductPicker products={link.products} value={values.product_id} onChange={pickProduct} />
                  ) : f.type === "batch" ? (
                    <Input
                      id={f.key}
                      value={values[f.key] || ""}
                      onChange={(e) => set(f.key, e.target.value.toUpperCase())}
                      placeholder={f.placeholder || `Enter ${f.label}`}
                      required={f.required}
                      className="bg-white border-[#E2E8F0] text-[#0F294A]"
                    />
                  ) : f.type === "user" ? (
                    <Input
                      id={f.key}
                      value={values[f.key] || ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder || `Enter ${f.label}`}
                      required={f.required}
                      className="bg-white border-[#E2E8F0] text-[#0F294A]"
                    />
                  ) : f.type === "line" ? (
                    <Select value={values[f.key] || undefined} onValueChange={(v) => set(f.key, v)}>
                      <SelectTrigger id={f.key} className="bg-white border-[#E2E8F0] text-[#0F294A]">
                        <SelectValue placeholder={`Select ${f.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([
                          ...(Array.isArray(f.options) ? f.options : []),
                          ...machines.map((m) => (typeof m === "string" ? m : m?.value || m?.name || "")).filter(Boolean),
                        ])].map((lineOpt) => (
                          <SelectItem key={lineOpt} value={lineOpt}>{lineOpt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "select" ? (
                    <Select value={values[f.key] || undefined} onValueChange={(v) => set(f.key, v)}>
                      <SelectTrigger id={f.key} className="bg-white border-[#E2E8F0] text-[#0F294A]">
                        <SelectValue placeholder={`Select ${f.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => {
                          if (opt && typeof opt === "object" && Array.isArray(opt.options)) {
                            return (
                              <SelectGroup key={opt.group}>
                                <SelectLabel className="text-[#1D4ED8]">{opt.group}</SelectLabel>
                                {opt.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectGroup>
                            );
                          }
                          const value = typeof opt === "string" ? opt : opt.value;
                          const label = typeof opt === "string" ? opt : opt.label;
                          return <SelectItem key={value} value={value}>{label}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      id={f.key}
                      value={values[f.key] || ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder || ""}
                      required={f.required}
                      className="bg-white border-[#E2E8F0] text-[#0F294A] min-h-[70px]"
                    />
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                      step={f.type === "number" ? "any" : undefined}
                      value={values[f.key] ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder || ""}
                      required={f.required}
                      className="bg-white border-[#E2E8F0] text-[#0F294A]"
                    />
                  )}
                </>
              )}
            </div>
          ))}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-[#64748B] hover:text-[#0F294A] hover:bg-[#F1F5F9]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
              {saving ? "Saving..." : initialData ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
