import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import MachineDialog from "@/components/planning/MachineDialog";
import { canEditMachines, loadMachines, num } from "@/lib/planning";
import { archiveMachineSafely } from "@/lib/deleteIntegrity";
import { productionLines } from "@/lib/shiftLogConstants";
import { primaryButton, panelClass } from "@/components/planning/styles";

const STATUS_STYLES = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-300",
  "Under Maintenance": "bg-amber-50 text-amber-700 border-amber-300",
};

export default function Machines() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = canEditMachines(user);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, machine: null });

  const load = async () => {
    setMachines(await loadMachines());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const availableNames = productionLines.filter((name) => !machines.some((m) => m.name === name));
  const closeDialog = () => setDialog({ open: false, machine: null });

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete machine "${m.name}"?`)) return;
    try {
      await archiveMachineSafely(m.id, m.name);
      toast({ title: "Machine archived", description: m.name });
      await load();
    } catch (err) {
      toast({ title: "Could not delete machine", description: err?.message || "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Machines & Production Lines</h2>
          <p className="text-[#64748B] text-sm mt-1">Manage production lines, cooking tanks, capacities, and maintenance status.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ open: true, machine: null })} className={primaryButton}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Machine
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#0F294A] rounded-full animate-spin" />
        </div>
      ) : (
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#64748B] border-b border-[#E2E8F0]">
                <th className="text-left font-semibold px-3 py-2">Machine</th>
                <th className="text-left font-semibold px-3 py-2">Location</th>
                <th className="text-right font-semibold px-3 py-2">Capacity (ctn/hr)</th>
                <th className="text-left font-semibold px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {machines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[#64748B]">No machines yet.</td>
                </tr>
              ) : (
                machines.map((m) => (
                  <tr key={m.id} className="border-b border-[#E2E8F0] hover:bg-[#F1F5F9]">
                    <td className="px-3 py-2 text-[#0F294A]">{m.name}</td>
                    <td className="px-3 py-2 text-[#64748B]">{m.location || "—"}</td>
                    <td className="px-3 py-2 text-right text-[#64748B]">{num(m.capacity_cph).toLocaleString("en-US") || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[m.status] || STATUS_STYLES.Active}`}>
                        {m.status || "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, machine: m })} className="text-[#64748B] hover:text-[#1D4ED8] hover:bg-[#EBF3FF]" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} className="text-[#64748B] hover:text-rose-600 hover:bg-rose-600/10" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[#64748B]">
        {machines.length} of {productionLines.length} production line(s) set up.
        {availableNames.length > 0 && canEdit && ` Not yet added: ${availableNames.join(", ")}.`}
      </p>

      <MachineDialog
        open={dialog.open}
        onClose={closeDialog}
        machine={dialog.machine}
        availableNames={availableNames}
        existingNames={machines.map((m) => m.name)}
        onSaved={async () => { closeDialog(); await load(); }}
      />
    </div>
  );
}