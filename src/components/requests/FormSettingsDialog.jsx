import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { actingUserName } from "@/lib/permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  APPROVAL_TYPES,
  CONFIG_KEY,
  DEFAULT_FORM_CONFIG,
  DEFAULT_REQUIRED,
  EVIDENCE_REQUIRED_APPROVAL_TYPES,
  REQUEST_TYPES,
  TYPE_FIELDS,
} from "@/lib/requestConstants";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

// Admin-editable dropdown lists.
const LISTS = [
  { key: "categories", label: "Downtime Categories", placeholder: "Add downtime category..." },
  { key: "approval_types", label: "Approval Types", placeholder: "Add approval type..." },
  { key: "item_categories", label: "Item / Material Categories", placeholder: "Add item category..." },
  { key: "urgencies", label: "Urgency Options", placeholder: "Add urgency option..." },
  { key: "proposed_actions", label: "Proposed Actions", placeholder: "Add proposed action..." },
  { key: "owner_teams", label: "Owner Teams", placeholder: "Add owner team..." },
  { key: "printed_items", label: "What Was Printed Options", placeholder: "Add printed item option..." },
];

function OptionListCard({ label, placeholder, items, onAdd, onRemove, className = "" }) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const val = draft.trim();
    if (!val) return;
    onAdd(val);
    setDraft("");
  };

  return (
    <div className={`rounded-xl border border-[#1e2740] bg-[#0e131d] p-4 flex flex-col justify-between gap-3 ${className}`}>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold text-slate-200">{label}</Label>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#131926] border border-[#1e2740] text-slate-400">
            {items.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 ? (
            <span className="text-xs text-slate-500">No options added yet.</span>
          ) : (
            items.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#293548] bg-[#131926] px-2.5 py-1 text-xs text-slate-200"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label={`Remove ${item}`}
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs bg-[#131926] border-[#293548] text-white placeholder:text-slate-500"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!draft.trim()}
          onClick={submit}
          className="h-8 px-2.5 text-xs shrink-0 border-[#293548] bg-[#131926] text-slate-200 hover:bg-[#1e293b] hover:text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

// Admin settings for the New Request form: dropdown lists, which fields are
// required per request type, evidence rules, and the purchase MD limit.
export default function FormSettingsDialog({ open, onOpenChange, config = DEFAULT_FORM_CONFIG, user, onSaved }) {
  const [lists, setLists] = useState({});
  const [required, setRequired] = useState(DEFAULT_REQUIRED);
  const [evidenceDowntime, setEvidenceDowntime] = useState(true);
  const [evidenceApprovals, setEvidenceApprovals] = useState([]);
  const [mdLimit, setMdLimit] = useState(500);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setLists(
        Object.fromEntries(
          LISTS.map((l) => [l.key, Array.isArray(config[l.key]) ? [...config[l.key]] : []])
        )
      );
      setRequired(config.required || DEFAULT_REQUIRED);
      setEvidenceDowntime(config.evidence_required_downtime !== false);
      setEvidenceApprovals(config.evidence_required_approval_types || EVIDENCE_REQUIRED_APPROVAL_TYPES);
      setMdLimit(config.purchase_md_limit || 500);
      setError("");
    }
  }, [open, config]);

  const addOption = (key, value) => {
    setLists((prev) => {
      const current = prev[key] || [];
      if (current.some((item) => item.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [key]: [...current, value] };
    });
  };

  const removeOption = (key, value) => {
    setLists((prev) => ({
      ...prev,
      [key]: (prev[key] || []).filter((item) => item !== value),
    }));
  };

  const toggleRequired = (type, key) =>
    setRequired((r) => {
      const current = r[type] || [];
      return { ...r, [type]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] };
    });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        key: CONFIG_KEY,
        ...Object.fromEntries(LISTS.map((l) => [l.key, (lists[l.key] || []).map((s) => s.trim()).filter(Boolean)])),
        required,
        evidence_required_downtime: evidenceDowntime,
        evidence_required_approval_types: evidenceApprovals,
        purchase_md_limit: Number(mdLimit) || 0,
        updated_by: user?.full_name || user?.email || "",
      };
      const page = await base44.entities.FormConfig.filter({ key: CONFIG_KEY }, { limit: 1 });
      if (page.items?.length) {
        await base44.entities.FormConfig.update(page.items[0].id, payload);
      } else {
        await base44.entities.FormConfig.create(payload);
      }
      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Requests & Stoppages",
          action: "Updated",
          record_id: "",
          details: "Form dropdowns and required-field settings changed",
          old_value: "",
          new_value: "",
        });
      } catch {
        // An audit write must never block the save.
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Could not save the settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131926] border-[#1e2740] text-slate-100 flex flex-col p-0 gap-0 max-h-[90dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-4 sm:px-6 pt-5 pb-3.5 pr-12 border-b border-[#1e2740]">
          <DialogTitle className="text-white">Form Settings</DialogTitle>
          <p className="text-xs text-slate-400">
            Configure dropdown options, required fields, evidence rules, and spending limits.
          </p>
        </DialogHeader>

        <Tabs defaultValue="lists" className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-[#1e2740]">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex bg-[#0e131d] border border-[#1e2740] h-auto p-1 gap-1">
              <TabsTrigger
                value="lists"
                className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 text-slate-400 hover:text-slate-200 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white"
              >
                Dropdowns
              </TabsTrigger>
              <TabsTrigger
                value="required"
                className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 text-slate-400 hover:text-slate-200 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white"
              >
                Required Fields
              </TabsTrigger>
              <TabsTrigger
                value="rules"
                className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 text-slate-400 hover:text-slate-200 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white"
              >
                Evidence &amp; Limits
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
            <TabsContent value="lists" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LISTS.map((l, idx) => (
                  <OptionListCard
                    key={l.key}
                    label={l.label}
                    placeholder={l.placeholder}
                    items={lists[l.key] || []}
                    onAdd={(val) => addOption(l.key, val)}
                    onRemove={(val) => removeOption(l.key, val)}
                    className={idx === LISTS.length - 1 && LISTS.length % 2 === 1 ? "md:col-span-2" : ""}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="required" className="mt-0 space-y-4">
              <p className="text-xs text-slate-400">
                Choose which fields must be filled before a user can submit each request type.
              </p>
              {REQUEST_TYPES.map((t) => {
                const count = (required[t] || []).length;
                return (
                  <div key={t} className="space-y-3 rounded-xl border border-[#1e2740] bg-[#0e131d] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-wide text-[#60a5fa]">{t}</p>
                      <span className="text-[11px] text-slate-400">{count} required</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {TYPE_FIELDS[t].map((f) => (
                        <label
                          key={f.key}
                          className="flex items-start gap-2.5 rounded-lg border border-[#1e2740] bg-[#131926] px-3 py-2 text-xs text-slate-200 cursor-pointer hover:border-[#293548] transition-colors"
                        >
                          <Checkbox
                            className="mt-0.5 shrink-0"
                            checked={(required[t] || []).includes(f.key)}
                            onCheckedChange={() => toggleRequired(t, f.key)}
                          />
                          <span className="leading-snug">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="rules" className="mt-0 space-y-4">
              <div className="space-y-3 rounded-xl border border-[#1e2740] bg-[#0e131d] p-4">
                <p className="text-xs font-semibold text-slate-200">Evidence photo requirements</p>
                <label className="flex items-start gap-2.5 rounded-lg border border-[#1e2740] bg-[#131926] px-3 py-2.5 text-sm text-slate-200 cursor-pointer hover:border-[#293548]">
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={evidenceDowntime}
                    onCheckedChange={(c) => setEvidenceDowntime(c === true)}
                  />
                  <span className="leading-snug">Evidence photo required for Downtime / Stoppage</span>
                </label>
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-slate-400">Evidence photo required for these approval types:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {APPROVAL_TYPES.map((t) => (
                      <label
                        key={t}
                        className="flex items-start gap-2.5 rounded-lg border border-[#1e2740] bg-[#131926] px-3 py-2 text-xs text-slate-200 cursor-pointer hover:border-[#293548]"
                      >
                        <Checkbox
                          className="mt-0.5 shrink-0"
                          checked={evidenceApprovals.includes(t)}
                          onCheckedChange={(c) =>
                            setEvidenceApprovals((list) => (c === true ? [...list, t] : list.filter((x) => x !== t)))
                          }
                        />
                        <span className="leading-snug">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[#1e2740] bg-[#0e131d] p-4">
                <Label className="text-xs font-semibold text-slate-200 block">
                  Purchase / Spending Admin Routing Limit
                </Label>
                <Input
                  type="number"
                  value={mdLimit}
                  onChange={(e) => setMdLimit(e.target.value)}
                  className="bg-[#131926] border-[#293548] text-white max-w-xs"
                />
                <p className="text-xs text-slate-400">
                  Purchase or spending approval requests above this amount are automatically routed to Admin.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="shrink-0 border-t border-[#1e2740] px-4 sm:px-6 py-3.5 bg-[#0e131d] space-y-2">
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <DialogFooter className="pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#293548] bg-transparent text-slate-200 hover:bg-[#1e293b] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={save}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold"
            >
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}