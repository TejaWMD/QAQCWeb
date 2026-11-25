import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X } from "lucide-react";
import RackSettingsCard from "@/components/warehouse/RackSettingsCard";
import { PACKAGING_SETTINGS_KEY, USE_THRESHOLD_DEFAULT, loadPackagingSettings } from "@/lib/packaging";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

// Categories, racks and the issue-approval threshold for Packaging Stock.
export default function PackagingSettingsDialog({ open, initialTab = "categories", updatedBy, onClose, onSaved }) {
  const [docId, setDocId] = useState("");
  const [categories, setCategories] = useState([]);
  const [threshold, setThreshold] = useState(String(USE_THRESHOLD_DEFAULT));
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNewCategory("");
    loadPackagingSettings().then((s) => {
      setDocId(s.id);
      setCategories(s.categories);
      setThreshold(String(s.threshold));
    });
  }, [open]);

  const save = async () => {
    if (!categories.length) return setError("Keep at least one category.");
    setSaving(true);
    setError("");
    try {
      const payload = {
        key: PACKAGING_SETTINGS_KEY,
        categories,
        use_approval_threshold: Number(threshold) || 0,
        updated_by: updatedBy || "",
      };
      if (docId) await base44.entities.PackagingSettings.update(docId, payload);
      else {
        const created = await base44.entities.PackagingSettings.create(payload);
        setDocId(created.id);
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Packaging stock settings</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            Categories offered on the item form, the rack list, and the quantity above which an issue needs approval.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={initialTab}>
          <TabsList className="bg-white border border-[#E2E8F0] w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="racks">Racks</TabsTrigger>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-3 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                className={FIELD}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const value = newCategory.trim();
                  if (!value || categories.includes(value)) return;
                  setCategories((prev) => [...prev, value]);
                  setNewCategory("");
                }}
              />
              <Button
                onClick={() => {
                  const value = newCategory.trim();
                  if (!value || categories.includes(value)) return;
                  setCategories((prev) => [...prev, value]);
                  setNewCategory("");
                }}
                className="bg-[#0F294A] hover:bg-[#193B68] text-white"
              >
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c} className="flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs text-[#64748B]">
                  {c}
                  <button type="button" onClick={() => setCategories((prev) => prev.filter((x) => x !== c))} className="text-[#64748B] hover:text-rose-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="racks" className="mt-3">
            <RackSettingsCard />
          </TabsContent>

          <TabsContent value="thresholds" className="mt-3 space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Use Approval Threshold</label>
              <Input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={FIELD} />
              <p className="text-[11px] text-[#64748B]">A stock issue above this quantity goes to approvals instead of being deducted. Set 0 to never require approval.</p>
            </div>
          </TabsContent>
        </Tabs>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">Close</Button>
          <Button type="button" onClick={save} disabled={saving} className="bg-[#0F294A] hover:bg-[#193B68] text-white font-semibold">
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}