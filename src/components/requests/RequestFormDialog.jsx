import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { actingUserName } from "@/lib/permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import EvidenceUploader from "@/components/requests/EvidenceUploader";
import {
  loadBatchOptions,
  loadMachineOptions,
  loadMaterialAndPackagingOptions,
  loadProductHoldOptions,
  loadProductionOrderOptions,
  loadProductOptions,
  loadUserOptions,
} from "@/lib/masterOptions";
import {
  REQUEST_TYPES,
  DOWNTIME_TYPE,
  ITEM_TYPE,
  APPROVAL_TYPE,
  APPROVAL_CONDITIONAL_FIELDS,
  DEFAULT_FORM_CONFIG,
  DEFAULT_REQUIRED,
  FIELD_LABELS,
  LABELLING_TYPE,
  PURCHASE_TYPE,
  TYPE_FIELDS,
} from "@/lib/requestConstants";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

const keysOf = (type) => TYPE_FIELDS[type].map((f) => f.key);

// The fields shown for the selected type; hidden fields are neither required
// nor saved.
const visibleKeysFor = (type, values) => {
  if (type === DOWNTIME_TYPE) return [...keysOf(DOWNTIME_TYPE), "notes", "is_demo"];
  if (type === ITEM_TYPE) return keysOf(ITEM_TYPE);
  return [...keysOf(APPROVAL_TYPE), ...(APPROVAL_CONDITIONAL_FIELDS[values.approval_type] || [])];
};

// How each field renders; select options come from the admin-editable config and backend masters.
const fieldDefs = (config) => ({
  shift_date: { type: "date" },
  shift_type: { type: "select", options: ["Morning", "Night"], default: "Morning" },
  start_time: { type: "time" },
  end_time: { type: "time" },
  duration_min: { type: "number" },
  category: { type: "select", options: config.categories, default: "Mechanical" },
  reason: { type: "textarea" },
  immediate_action_taken: { type: "textarea" },
  product_affected: { type: "select", options: ["No", "Yes"], default: "No" },
  notes: { type: "textarea" },
  is_demo: { type: "checkbox" },
  item_name: { type: "material" },
  quantity: { type: "number" },
  urgency: { type: "select", options: config.urgencies, default: "Normal" },
  needed_by_date: { type: "date" },
  item_category: { type: "select", options: config.item_categories },
  estimated_cost: { type: "number" },
  approval_type: { type: "select", options: config.approval_types },
  description: { type: "textarea" },
  product_sku: { type: "product" },
  batch_number: { type: "batch" },
  order_number: { type: "order" },
  quantity_affected: { type: "number" },
  proposed_action: { type: "select", options: config.proposed_actions },
  impact_if_not_approved: { type: "textarea" },
  needed_by_datetime: { type: "datetime" },
  printed_value: { type: "text" },
  correct_value: { type: "text" },
  printed_item: { type: "select", options: config.printed_items },
  qty_produced: { type: "number" },
  already_packed: { type: "select", options: ["No", "Yes"], default: "No" },
  packed_qty: { type: "number" },
  line_stopped: { type: "select", options: ["No", "Yes"], default: "No" },
  ot_workers: { type: "number" },
  ot_hours: { type: "number" },
  ot_reason: { type: "text" },
  ot_date: { type: "date" },
  rework_reason: { type: "textarea" },
  rework_method: { type: "text" },
  qa_signoff: { type: "user" },
  hold_reference: { type: "hold" },
  qa_decision: { type: "text" },
  purchase_amount: { type: "number" },
  sop_reference: { type: "text" },
  sop_deviation: { type: "textarea" },
  sop_risk: { type: "text" },
  sop_duration: { type: "text" },
});

// New Request form: common fields for all three types, per-type fields that
// change with the Request Type, required-field validation with asterisks,
// and evidence upload. Hidden fields are never required and never saved.
export default function RequestFormDialog({ open, onOpenChange, user, config = DEFAULT_FORM_CONFIG, onSaved }) {
  const [type, setType] = useState(DOWNTIME_TYPE);
  const [values, setValues] = useState({});
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState({
    lines: [],
    products: [],
    batches: [],
    orders: [],
    materials: [],
    users: [],
    holds: [],
  });

  useEffect(() => {
    if (!open || opts.lines.length) return;
    Promise.all([
      loadMachineOptions(),
      loadProductOptions(),
      loadBatchOptions(),
      loadProductionOrderOptions(),
      loadMaterialAndPackagingOptions(),
      loadUserOptions(),
      loadProductHoldOptions(),
    ]).then(([lines, products, batches, orders, materials, users, holds]) => {
      setOpts({ lines, products, batches, orders, materials, users, holds });
    }).catch(() => {});
  }, [open, opts.lines.length]);

  const defs = useMemo(() => fieldDefs(config), [config]);

  const defaults = useMemo(() => {
    const d = { owners: [], production_line: "" };
    Object.entries(defs).forEach(([k, def]) => {
      d[k] = def.type === "checkbox" ? false : def.default !== undefined ? def.default : "";
    });
    return d;
  }, [defs]);

  useEffect(() => {
    if (open) {
      setType(DOWNTIME_TYPE);
      const init = { ...defaults };
      if (user?.line) init.production_line = user.line;
      setValues(init);
      setEvidenceFiles([]);
      setError("");
    }
  }, [open, defaults]);

  const visibleKeys = visibleKeysFor(type, values);
  const requiredKeys = config.required?.[type] || DEFAULT_REQUIRED[type];
  const requesterName = user?.full_name || user?.email || "";

  // Labelling / Packaging Error requests are always routed to the QA/QC Team.
  const qaForced = type === APPROVAL_TYPE && values.approval_type === LABELLING_TYPE;

  // Changing the Request Type clears the hidden fields but keeps the common ones.
  const switchType = (t) => {
    setType(t);
    setValues((v) => ({
      ...defaults,
      production_line: v.production_line,
      owners: v.owners,
    }));
    setError("");
  };

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const setApprovalType = (v) => {
    setValues((prev) => {
      const owners = [...(prev.owners || [])];
      if (v === LABELLING_TYPE && !owners.includes("QA/QC Team")) owners.push("QA/QC Team");
      return { ...prev, approval_type: v, owners };
    });
  };

  const toggleOwner = (team, checked) => {
    if (qaForced && team === "QA/QC Team" && !checked) return;
    setValues((v) => ({
      ...v,
      owners: checked ? [...(v.owners || []), team] : (v.owners || []).filter((t) => t !== team),
    }));
  };

  // Auto-calculate the downtime duration from the start and end times.
  useEffect(() => {
    if (type !== DOWNTIME_TYPE) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(values.start_time || "");
    const n = /^(\d{1,2}):(\d{2})$/.exec(values.end_time || "");
    if (m && n) {
      const mins = +n[1] * 60 + +n[2] - (+m[1] * 60 + +m[2]);
      if (mins > 0) setValues((v) => (v.duration_min === mins ? v : { ...v, duration_min: mins }));
    }
  }, [type, values.start_time, values.end_time]);

  const evidenceRequired =
    type === DOWNTIME_TYPE
      ? config.evidence_required_downtime !== false
      : type === ITEM_TYPE
        ? false
        : (config.evidence_required_approval_types || []).includes(values.approval_type);

  const audit = async (action, recordId, details) => {
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: eventStamp(),
        user_name: actingUserName(user),
        module: "Requests & Stoppages",
        action,
        record_id: recordId || "",
        details,
        old_value: "",
        new_value: "Submitted",
      });
    } catch {
      // An audit write must never block the submission.
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const missing = [];
    if (!(values.owners || []).length) missing.push("Owner");
    visibleKeys.forEach((k) => {
      if (requiredKeys.includes(k) && (values[k] === "" || values[k] === undefined || values[k] === null)) {
        missing.push(FIELD_LABELS[k] || k);
      }
    });
    if (missing.length) {
      setError(`Please fill the required fields: ${missing.join(", ")}.`);
      return;
    }
    if (evidenceRequired && evidenceFiles.length === 0) {
      setError("A photo is required for this request type. Add evidence before submitting.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Upload evidence privately; the uploader and time are recorded per file.
      const evidence_files = [];
      for (const f of evidenceFiles) {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: f.file });
        evidence_files.push({
          file_uri,
          file_name: f.file.name,
          caption: f.caption || "",
          uploaded_by: requesterName,
          uploaded_date: new Date().toISOString(),
        });
      }

      // Auto-routing rules.
      const owners = [...(values.owners || [])];
      if (qaForced && !owners.includes("QA/QC Team")) owners.push("QA/QC Team");
      if (
        type === APPROVAL_TYPE &&
        values.approval_type === PURCHASE_TYPE &&
        (values.purchase_amount || 0) > (config.purchase_md_limit || 500) &&
        !owners.includes("MD")
      ) {
        owners.push("MD");
      }

      // Only the visible fields of the selected type are saved.
      // Empty strings for number/date fields are converted to null so Postgres never rejects them.
      const payload = { owners, evidence_files };
      visibleKeys.forEach((k) => {
        const def = defs[k];
        const val = values[k];
        if (def?.type === "number") {
          payload[k] = val === "" || val === undefined || val === null ? null : Number(val);
        } else if ((def?.type === "date" || def?.type === "datetime") && val === "") {
          payload[k] = null;
        } else {
          payload[k] = val;
        }
      });

      let created;
      if (type === DOWNTIME_TYPE) {
        try {
          created = await base44.entities.Downtime.create({ ...payload, status: "Open" });
        } catch (firstErr) {
          // Fallback if downtimes.start_time/end_time is still TIMESTAMPTZ in Supabase
          const msg = String(firstErr?.message || "").toLowerCase();
          if (msg.includes("timestamp") || msg.includes("time")) {
            const baseDate = payload.shift_date || new Date().toISOString().slice(0, 10);
            const fallbackPayload = {
              ...payload,
              start_time: /^\d{1,2}:\d{2}$/.test(String(payload.start_time || ""))
                ? new Date(`${baseDate}T${String(payload.start_time).padStart(5, "0")}:00`).toISOString()
                : payload.start_time || null,
              end_time: /^\d{1,2}:\d{2}$/.test(String(payload.end_time || ""))
                ? new Date(`${baseDate}T${String(payload.end_time).padStart(5, "0")}:00`).toISOString()
                : payload.end_time || null,
            };
            created = await base44.entities.Downtime.create({ ...fallbackPayload, status: "Open" });
          } else {
            throw firstErr;
          }
        }
      } else {
        created = await base44.entities.Request.create({
          ...payload,
          request_type: type,
          requester_name: requesterName,
          requester_id: user?.id || "",
          status: "Submitted",
        });
      }
      await audit("Created", created?.id, `New ${type} submitted${evidence_files.length ? ` with ${evidence_files.length} evidence file(s)` : ""}`);

      // Labelling / Packaging Error: hold the affected product until QA/QC decides.
      if (type === APPROVAL_TYPE && values.approval_type === LABELLING_TYPE) {
        const hold = await base44.entities.ProductHold.create({
          production_line: values.production_line || "",
          shift_date: new Date().toISOString().slice(0, 10),
          product_name: values.product_sku || "",
          batch_number: values.batch_number || "",
          hold_qty: values.qty_produced || 0,
          hold_reason: `Labelling / Packaging Error — ${values.description || "under review"}`.slice(0, 200),
          held_by: requesterName,
          owner: "QA/QC Team",
          status: "Open",
          notes: "Automatically held from the approval request until QA/QC decides.",
        });
        await audit("Created", hold?.id, "Affected product automatically placed on Hold (Labelling / Packaging Error)");
      }

      onSaved?.(created);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Could not submit the request. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (key) => {
    const def = defs[key];
    if (!def) return null;
    const label = FIELD_LABELS[key] || key;
    const required = requiredKeys.includes(key);
    if (def.type === "checkbox") {
      return (
        <div key={key} className="flex items-center gap-2 pt-1">
          <Checkbox id={key} checked={!!values[key]} onCheckedChange={(c) => set(key, c === true)} />
          <Label htmlFor={key} className="text-sm text-[#64748B] font-normal">{label}</Label>
        </div>
      );
    }
    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={key} className="text-xs text-[#64748B]">
          {label} {required && <span className="text-rose-600">*</span>}
        </Label>
        {def.type === "select" ? (
          <Select value={values[key] || undefined} onValueChange={(v) => (key === "approval_type" ? setApprovalType(v) : set(key, v))}>
            <SelectTrigger id={key} className="bg-white border-[#E2E8F0] text-[#0F294A]">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
              {(def.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : def.type === "product" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => set(key, v)}
            options={opts.products}
            placeholder="Select product..."
            searchPlaceholder="Search product..."
            allowCustom={opts.products.length === 0}
            clearable={!required}
          />
        ) : def.type === "batch" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => set(key, v)}
            options={opts.batches}
            placeholder="Select batch..."
            searchPlaceholder="Search batch number..."
            allowCustom
            clearable={!required}
          />
        ) : def.type === "order" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => set(key, v)}
            options={opts.orders}
            placeholder="Select production order..."
            searchPlaceholder="Search order..."
            allowCustom
            clearable={!required}
          />
        ) : def.type === "material" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => {
              const match = opts.materials.find((m) => m.value === v || m.label === v);
              setValues((prev) => ({
                ...prev,
                [key]: v,
                ...(match?.unit && !prev.unit ? { unit: match.unit } : {}),
              }));
            }}
            options={opts.materials}
            placeholder="Select material / item..."
            searchPlaceholder="Search item..."
            allowCustom
            clearable={!required}
          />
        ) : def.type === "user" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => set(key, v)}
            options={opts.users}
            placeholder={`Select ${label}`}
            searchPlaceholder="Search person..."
            allowCustom={opts.users.length === 0}
            clearable={!required}
          />
        ) : def.type === "hold" ? (
          <SearchableSelect
            id={key}
            value={values[key] ?? ""}
            onValueChange={(v) => set(key, v)}
            options={opts.holds}
            placeholder="Select hold reference..."
            searchPlaceholder="Search held batch..."
            allowCustom
            clearable={!required}
          />
        ) : def.type === "textarea" ? (
          <Textarea
            id={key}
            value={values[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            className="bg-white border-[#E2E8F0] text-[#0F294A] min-h-[70px]"
          />
        ) : (
          <Input
            id={key}
            type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "time" ? "time" : def.type === "datetime" ? "datetime-local" : "text"}
            step={def.type === "number" ? "any" : undefined}
            value={values[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            className="bg-white border-[#E2E8F0] text-[#0F294A]"
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">New Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#64748B]">
              Request Type <span className="text-rose-600">*</span>
            </Label>
            <Select value={type} onValueChange={switchType}>
              <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#64748B]">Requester</Label>
            <p className="text-sm text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
              {requesterName || "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#64748B]">
              Owner <span className="text-rose-600">*</span>
            </Label>
            <div className="flex flex-wrap gap-4">
              {(config.owner_teams || []).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
                  <Checkbox
                    checked={(values.owners || []).includes(t)}
                    onCheckedChange={(c) => toggleOwner(t, c === true)}
                    disabled={qaForced && t === "QA/QC Team"}
                  />
                  {t}
                </label>
              ))}
            </div>
            {qaForced && (
              <p className="text-[10px] text-[#64748B]">Labelling / Packaging Error requests are always routed to the QA/QC Team.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#64748B]">
              Evidence / Proof {evidenceRequired && <span className="text-rose-600">*</span>}
            </Label>
            <EvidenceUploader files={evidenceFiles} onChange={setEvidenceFiles} />
            {evidenceRequired && <p className="text-[10px] text-[#64748B]">A photo is required for this request type.</p>}
          </div>

          {visibleKeys.map(renderField)}

          {error && <p className="text-xs text-rose-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-[#64748B] hover:text-[#0F294A] hover:bg-[#F1F5F9]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
              {saving ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}