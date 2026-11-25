import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { actingUserName } from "@/lib/permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, CheckCircle2, XCircle, Undo2, Paperclip } from "lucide-react";
import { TYPE_STYLES, requestSummary, rowOwnerTeams } from "@/lib/requestConstants";
import { pushRequestDecisionNotification } from "@/lib/notifications";
import { fmtDay } from "@/lib/labels";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

const DECISIONS = {
  Approve: { status: "Approved", verb: "approved", comment: false },
  Reject: { status: "Rejected", verb: "rejected", comment: true },
  Return: { status: "Returned for more info", verb: "returned", comment: true },
};

// Owner decision dialog: Approve, Reject or Return with a comment (required
// for Reject and Return). Records who decided and when, and blocks the
// requester from deciding on their own request.
export default function RequestDecisionDialog({ open, onOpenChange, request, user, onSaved }) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openEvidence = async (file) => {
    try {
      const uri = typeof file === "string" ? file : file?.uri || file?.file_uri;
      if (!uri) return;
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      if (signed_url) window.open(signed_url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (open) {
      setComment("");
      setError("");
    }
  }, [open]);

  if (!request) return null;

  const decide = async (action) => {
    if (request.requester_id === user?.id) {
      setError("You cannot decide on your own request.");
      return;
    }
    const d = action === "Start Review"
      ? { status: "Under Review", verb: "moved to Under Review", comment: false }
      : DECISIONS[action];
    if (d.comment && !comment.trim()) {
      setError("A comment is required to reject or return a request.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const prev = request.status;
      const name = user?.full_name || user?.email || "";
      await base44.entities.Request.update(request.id, {
        status: d.status,
        decided_by: name,
        decided_by_id: user?.id || "",
        decided_date: new Date().toISOString(),
        decision_comment: comment.trim(),
      });
      try {
        await base44.entities.AuditLog.create({
          event_time: new Date().toISOString(),
          event_stamp: eventStamp(),
          user_name: actingUserName(user),
          module: "Requests & Stoppages",
          action: "Updated",
          record_id: request.id,
          details: `Request "${requestSummary(request)}" ${d.verb} by ${name}${comment.trim() ? ` — comment: ${comment.trim()}` : ""}`,
          old_value: prev,
          new_value: d.status,
        });
      } catch {
        // An audit write must never block the decision.
      }
      if (d.status === "Approved" || d.status === "Rejected") {
        await pushRequestDecisionNotification({
          recordId: request.id,
          status: d.status,
          summary: requestSummary(request),
          decidedBy: name,
          decidedById: user?.id || "",
          decidedByPortalId: user?.portal_user_id || "",
          decidedByEmail: user?.email || "",
          comment: comment.trim(),
          requesterId: request.requester_id || "",
          requesterName: request.requester_name || "",
          requesterEmail: request.requester_email || "",
          owners: rowOwnerTeams(request),
        });
        toast.success(
          `Request ${d.verb} — notification sent${request.requester_name ? ` to ${request.requester_name}` : ""}.`
        );
      } else {
        toast.success(`Request ${d.verb}.`);
      }
      await onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Could not record the decision. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Review Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 rounded-lg bg-white border border-[#E2E8F0] p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block text-[10px] font-semibold border rounded px-1.5 py-0.5 ${TYPE_STYLES[request.request_type] || ""}`}>
              {request.request_type}
            </span>
            <span className="text-[#64748B] text-xs">
              from {request.requester_name || "—"} · {request.shift_date ? fmtDay(request.shift_date) : "—"}
            </span>
          </div>
          <p className="text-[#0F294A] font-medium">{requestSummary(request)}</p>
          {request.reason && <p className="text-[#64748B] text-xs">Reason: {request.reason}</p>}
          {request.decision_comment && (
            <p className="text-[#64748B] text-xs">Previous decision comment: {request.decision_comment}</p>
          )}
          <p className="text-[#64748B] text-xs">Current status: {request.status}</p>
          {(request.evidence_files || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {request.evidence_files.map((f, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => openEvidence(f)}
                  className="inline-flex items-center gap-1 text-xs text-[#1D4ED8] hover:underline border border-[#E2E8F0] rounded px-2 py-0.5"
                >
                  <Paperclip className="w-3 h-3" />
                  {typeof f === "object" && (f?.file_name || f?.name) ? (f.file_name || f.name) : `Attachment ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-[#64748B]">Comment (required to Reject or Return)</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="bg-white border-[#E2E8F0] text-[#0F294A] min-h-[70px]"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <DialogFooter className="sm:flex-wrap gap-2.5 pt-2">
          {request.status === "Submitted" && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => decide("Start Review")} className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">
              <Clock className="w-4 h-4 mr-1" /> Start Review
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9]">
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => decide("Approve")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
          </Button>
          <Button type="button" disabled={saving} onClick={() => decide("Return")} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            <Undo2 className="w-4 h-4 mr-1" /> Return
          </Button>
          <Button type="button" disabled={saving} onClick={() => decide("Reject")} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold">
            <XCircle className="w-4 h-4 mr-1" /> Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}