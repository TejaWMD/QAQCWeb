import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, canChangeRecord, isManagerRole } from "@/lib/permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import EvidenceUpload from "@/components/factoryops/EvidenceUpload";
import StatusBadge from "@/components/factoryops/StatusBadge";
import { PlayCircle, BadgeCheck, Lock } from "lucide-react";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

// Task cell detail dialog from the Task Matrix: a supervisor can only close a
// task by attaching evidence; a manager (admin) then marks it Verified.
export default function TaskCellDialog({ task, onOpenChange, onUpdated }) {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState({ uri: "", name: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEvidence({ uri: task?.evidence_file_uri || "", name: task?.evidence_file_name || "" });
  }, [task?.id, task?.evidence_file_uri, task?.evidence_file_name]);

  if (!task) return null;

  const isManager = isManagerRole(user);
  const canEdit = canChangeRecord(user, task);
  const hasEvidence = !!evidence.uri;
  const me = (user?.full_name || user?.email || "").trim().toLowerCase();
  const isOwner = !!(task.owner && me && task.owner.trim().toLowerCase() === me);

  const audit = async (status, oldStatus) => {
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: eventStamp(),
        user_name: actingUserName(user),
        module: "Supervisor Task Matrix",
        action: status === "Verified" ? "Verified" : "Updated",
        record_id: task.id,
        details: `Task "${task.title}" marked ${status}`,
        old_value: oldStatus,
        new_value: status,
      });
    } catch {
      // An audit write must never block the operation itself.
    }
  };

  const update = async (status) => {
    if (status === "Verified" && isOwner) {
      window.alert("The verifier cannot be the owner of this item.");
      return;
    }
    setBusy(true);
    try {
      const oldStatus = task.status || "";
      await base44.entities.Task.update(task.id, {
        status,
        evidence_file_uri: evidence.uri || "",
        evidence_file_name: evidence.name || "",
      });
      await audit(status, oldStatus);
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      window.alert(err?.message || "Failed to update task. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-[#64748B]">Supervisor:</span> <span className="text-[#334155]">{task.owner || "Unassigned"}</span></div>
            <div><span className="text-[#64748B]">Module:</span> <span className="text-[#334155]">{task.module || "—"}</span></div>
            <div><span className="text-[#64748B]">Due Date:</span> <span className="text-[#334155]">{task.due_date || "—"}</span></div>
            <div><span className="text-[#64748B]">Priority:</span> <span className="text-[#334155]">{task.priority || "—"}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#64748B] text-xs">Status:</span>
            <StatusBadge status={task.status} />
          </div>
          {task.notes && <p className="text-xs text-[#64748B] bg-white border border-[#E2E8F0] rounded-md p-2.5">{task.notes}</p>}
          <EvidenceUpload value={evidence} onChange={setEvidence} label="Evidence Attachment (required to close)" />
          <p className="text-[11px] text-[#64748B] flex items-start gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#1D4ED8]" />
            A task can only be closed by uploading evidence. A manager then marks it Verified.
          </p>
        </div>
        <DialogFooter className="gap-2">
          {task.status === "Open" && canEdit && (
            <Button disabled={busy} onClick={() => update("In Progress")} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
              <PlayCircle className="w-4 h-4 mr-1" /> Start Task
            </Button>
          )}
          {canEdit && !["Completed", "Verified"].includes(task.status) && (
            <Button disabled={busy || !hasEvidence} onClick={() => update("Completed")} className="bg-amber-500 hover:bg-amber-600 text-white">
              <BadgeCheck className="w-4 h-4 mr-1" /> Upload Evidence &amp; Complete
            </Button>
          )}
          {isManager && (
            <Button
              disabled={busy || !hasEvidence || task.status !== "Completed"}
              onClick={() => update("Verified")}
              className="bg-emerald-500 hover:bg-[#00e08a] text-[#0F294A]"
            >
              <BadgeCheck className="w-4 h-4 mr-1" /> Mark Verified
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}