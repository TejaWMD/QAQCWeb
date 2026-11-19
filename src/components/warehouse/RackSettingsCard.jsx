import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { deleteWarehouseRackSafely } from "@/lib/deleteIntegrity";

const FIELD = "bg-white border-[#E2E8F0] text-[#0F294A]";

// Rack locations used by the receiving form. Inactive racks are kept for history
// but no longer offered when keying in goods.
export default function RackSettingsCard() {
  const [racks, setRacks] = useState([]);
  const [code, setCode] = useState("");
  const [zone, setZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const page = await base44.entities.WarehouseRack.filter({}, { sort: "rack_code", limit: 500 });
    setRacks(page.items || []);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!code.trim()) return setError("Rack code is required.");
    setBusy(true);
    setError("");
    try {
      await base44.entities.WarehouseRack.create({ rack_code: code.trim(), zone: zone.trim(), status: "Active" });
      setCode("");
      setZone("");
      await load();
    } catch (e) {
      setError(e?.message || "Could not add the rack.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rack) => {
    setBusy(true);
    try {
      await base44.entities.WarehouseRack.update(rack.id, { status: rack.status === "Active" ? "Inactive" : "Active" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rack) => {
    if (!window.confirm(`Remove rack "${rack.rack_code}"?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await deleteWarehouseRackSafely(rack);
      if (res.action === "deactivated") {
        setError(`Rack "${rack.rack_code}" is used by ${res.refCount} item(s), so it was set Inactive instead of deleted.`);
      }
      await load();
    } catch (e) {
      setError(e?.message || "Could not remove the rack.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Rack code (e.g. A-01-1)" className={FIELD} />
        <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Zone (e.g. Dry Store)" className={FIELD} />
        <Button onClick={add} disabled={busy} className="bg-[#0F294A] hover:bg-[#193B68] text-white shrink-0">
          <Plus className="w-4 h-4" /> Add rack
        </Button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="divide-y divide-[#1e2740] rounded-lg border border-[#E2E8F0]">
        {racks.length === 0 && <p className="px-3 py-6 text-center text-sm text-[#64748B]">No racks yet.</p>}
        {racks.map((rack) => (
          <div key={rack.id} className="flex items-center gap-2 px-3 py-2">
            <span className="text-sm font-medium text-[#0F294A] w-24 shrink-0">{rack.rack_code}</span>
            <span className="text-sm text-[#64748B] flex-1 min-w-0 truncate">{rack.zone || "—"}</span>
            <button
              type="button"
              onClick={() => toggle(rack)}
              disabled={busy}
              className={`text-[11px] px-2 py-1 rounded-md border ${rack.status === "Active" ? "border-emerald-300 text-emerald-700" : "border-[#E2E8F0] text-[#64748B]"}`}
            >
              {rack.status || "Active"}
            </button>
            <button type="button" onClick={() => remove(rack)} disabled={busy} className="text-rose-600 hover:bg-[#F1F5F9] p-1.5 rounded-md">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}