import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, isAdminUser } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Settings2, CheckCircle2, XCircle, X } from "lucide-react";
import RequestFormDialog from "@/components/requests/RequestFormDialog";
import FormSettingsDialog from "@/components/requests/FormSettingsDialog";
import RequestsList from "@/components/requests/RequestsList";
import IncomingRequestsTab from "@/components/requests/IncomingRequestsTab";
import RequestDecisionDialog from "@/components/requests/RequestDecisionDialog";
import { deleteEntityWithCleanup } from "@/lib/deleteIntegrity";
import {
  isNotificationForUser,
  isNotificationRead,
  loadAllNotifications,
  markNotificationRead,
  pushRequestDecisionNotification,
  subscribeNotifications,
} from "@/lib/notifications";
import {
  REQUEST_TYPES,
  DOWNTIME_TYPE,
  ITEM_TYPE,
  DOWNTIME_STATUSES,
  ITEM_STATUSES,
  APPROVAL_STATUSES,
  OPEN_REQUEST_STATUSES,
  canChangeRequestStatus,
  canDecideRequests,
  coversTeam,
  isPurchaseDeptUser,
  requestSummary,
  rowOwnerTeams,
  DEFAULT_FORM_CONFIG,
  loadFormConfig,
} from "@/lib/requestConstants";

const eventStamp = () => {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
};

const ALL_STATUSES = [...new Set([...DOWNTIME_STATUSES, ...ITEM_STATUSES, ...APPROVAL_STATUSES])];

// One page for all three request types: Downtime / Stoppage records stay in
// their own entity (no data lost), Item / Material and Approval requests live
// in the new Request entity, and owners review incoming requests.
export default function RequestsStoppages() {
  const { user } = useAuth();
  const [downtime, setDowntime] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [purgingDemo, setPurgingDemo] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FORM_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [unreadAlerts, setUnreadAlerts] = useState([]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [down, req] = await Promise.all([
        base44.entities.Downtime.list("-created_date", 200),
        base44.entities.Request.list("-created_date", 200),
      ]);
      setDowntime(Array.isArray(down) ? down : down?.items || []);
      setRequests(Array.isArray(req) ? req : req?.items || []);
    } catch (err) {
      if (!silent) toast.error(err?.message || "Failed to load requests.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    loadFormConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const refreshNotifs = async () => {
      if (!user) return;
      const list = await loadAllNotifications();
      setUnreadAlerts(
        list.filter((n) => isNotificationForUser(n, user) && !isNotificationRead(n, user))
      );
    };
    refreshNotifs();
    return subscribeNotifications(refreshNotifs);
  }, [user]);

  useEffect(() => {
    const u1 = base44.entities.Downtime.subscribe(() => load(true));
    const u2 = base44.entities.Request.subscribe(() => load(true));

    const refreshIfVisible = () => {
      if (typeof document === "undefined" || !document.hidden) {
        load(true);
      }
    };
    const onFocus = () => load(true);
    const onSwMessage = (event) => {
      if (event.data?.type === "SW_NOTIFICATION_RECEIVED") {
        load(true);
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 10000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", refreshIfVisible);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      if (typeof u1 === "function") u1();
      if (typeof u2 === "function") u2();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, []);

  const purchaseView = isPurchaseDeptUser(user);

  const rows = useMemo(() => {
    const merged = purchaseView
      ? requests
          .filter((r) => r.request_type === ITEM_TYPE && r.status === "Approved")
          .map((r) => ({ ...r, _type: r.request_type }))
      : [
          ...downtime.map((d) => ({ ...d, _type: DOWNTIME_TYPE })),
          ...requests.map((r) => ({ ...r, _type: r.request_type })),
        ];
    return merged.sort(
      (a, b) =>
        (b.shift_date || "").localeCompare(a.shift_date || "") ||
        (b.created_date || "").localeCompare(a.created_date || "")
    );
  }, [downtime, requests, purchaseView]);

  const visible = rows.filter(
    (r) =>
      (purchaseView || typeFilter === "all" || r._type === typeFilter) &&
      (purchaseView || statusFilter === "all" || r.status === statusFilter) &&
      (evidenceFilter === "all" ||
        (evidenceFilter === "has" ? (r.evidence_files || []).length > 0 : (r.evidence_files || []).length === 0))
  );

  // Incoming: routed to a team this member covers, still open, and not their own.
  const incoming = purchaseView
    ? []
    : requests.filter(
        (r) => r.requester_id !== user?.id && coversTeam(user, r.owners) && OPEN_REQUEST_STATUSES.includes(r.status)
      );

  const reviewer = !purchaseView && canDecideRequests(user);

  const audit = async (action, recordId, details, oldValue = "", newValue = "") => {
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: eventStamp(),
        user_name: actingUserName(user),
        module: "Requests & Stoppages",
        action,
        record_id: recordId || "",
        details,
        old_value: oldValue,
        new_value: newValue,
      });
    } catch {
      // An audit write must never block the action itself.
    }
  };

  const changeStatus = async (row, status) => {
    if (!canChangeRequestStatus(user, row)) {
      toast.error("Only the assigned owner can change the status of this record.");
      return;
    }
    try {
      const prev = row.status || "";
      const entity = row._type === DOWNTIME_TYPE ? "Downtime" : "Request";
      const deciderName = user?.full_name || user?.name || user?.email || actingUserName(user);
      const isDecision = status === "Approved" || status === "Rejected";
      const patch = isDecision && entity === "Request"
        ? {
            status,
            decided_by: deciderName,
            decided_by_id: user?.id || "",
            decided_date: new Date().toISOString(),
          }
        : { status };
      await base44.entities[entity].update(row.id, patch);
      await audit("Updated", row.id, `Status changed to "${status}"`, prev, status);
      if (prev !== status) {
        const summary = entity === "Downtime" ? (row.reason || "Downtime / Stoppage") : requestSummary(row);
        await pushRequestDecisionNotification({
          recordId: row.id,
          status,
          summary,
          decidedBy: deciderName,
          decidedById: user?.id || "",
          decidedByPortalId: user?.portal_user_id || "",
          decidedByEmail: user?.email || "",
          requesterId: row.requester_id || "",
          requesterName: row.requester_name || row.created_by || "",
          requesterEmail: row.requester_email || "",
          owners: rowOwnerTeams(row),
        });
        toast.success(
          `Status updated to "${status}" — notification sent${row.requester_name ? ` to ${row.requester_name} & admins` : " to admins"}.`
        );
      } else {
        toast.success(`Status updated to "${status}".`);
      }
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Failed to update status.");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      const entity = row._type === DOWNTIME_TYPE ? "Downtime" : "Request";
      await deleteEntityWithCleanup(entity, row.id);
      await audit("Deleted", row.id, "Record deleted");
      toast.success("Record deleted successfully.");
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Failed to delete record.");
    }
  };

  const purgeDemo = async () => {
    if (!window.confirm("Delete ALL demo / test downtime records? This cannot be undone.")) return;
    setPurgingDemo(true);
    try {
      await base44.entities.Downtime.deleteMany({ is_demo: true });
      await audit("Deleted", "", "All demo / test downtime records deleted");
      toast.success("Demo downtime records deleted.");
      await load(true);
    } catch (err) {
      toast.error(err?.message || "Failed to delete demo records.");
    } finally {
      setPurgingDemo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[#0F294A] text-lg font-semibold">Requests &amp; Stoppages</h2>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminUser(user) && downtime.some((d) => d.is_demo) && (
            <Button
              variant="outline"
              disabled={purgingDemo}
              onClick={purgeDemo}
              className="bg-white border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-700"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Clear Demo
            </Button>
          )}
          {isAdminUser(user) && (
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="bg-white border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9]"
            >
              <Settings2 className="w-4 h-4 mr-1.5" /> Form Settings
            </Button>
          )}
          {!purchaseView && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
              <Plus className="w-4 h-4 mr-1.5" /> New Request
            </Button>
          )}
        </div>
      </div>

      {unreadAlerts.length > 0 && (
        <div className="space-y-2">
          {unreadAlerts.slice(0, 5).map((alert) => {
            const approved = alert.status === "Approved";
            return (
              <div
                key={alert.id}
                className={`rounded-xl border px-4 py-2.5 flex items-start justify-between gap-3 text-xs ${
                  approved
                    ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/35 text-rose-200"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {approved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{alert.title}</p>
                    <p className="opacity-90 mt-0.5">{alert.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await markNotificationRead(alert.id, user);
                    setUnreadAlerts((prev) => prev.filter((a) => a.id !== alert.id));
                  }}
                  title="Dismiss notification"
                  className="p-1 rounded hover:bg-white/10 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList className="bg-white border border-[#E2E8F0]">
          <TabsTrigger value="all" className="data-[state=active]:bg-[#EBF3FF] data-[state=active]:text-[#1D4ED8] text-[#64748B]">
            {purchaseView ? `Approved Item / Material Requests (${rows.length})` : `All Requests (${rows.length})`}
          </TabsTrigger>
          {reviewer && (
            <TabsTrigger value="incoming" className="data-[state=active]:bg-[#EBF3FF] data-[state=active]:text-[#1D4ED8] text-[#64748B]">
              Incoming Requests ({incoming.length})
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="all" className="space-y-3 mt-3">
          <div className="flex flex-wrap items-center gap-2">
            {purchaseView ? (
              <span className="inline-flex items-center h-8 px-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium">
                Purchase Dept View · Approved Item / Material Requests Only
              </span>
            ) : (
              <>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-[190px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {REQUEST_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[170px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Select value={evidenceFilter} onValueChange={setEvidenceFilter}>
              <SelectTrigger className="h-8 w-[160px] bg-white border-[#E2E8F0] text-[#0F294A] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All evidence</SelectItem>
                <SelectItem value="has">Has evidence</SelectItem>
                <SelectItem value="missing">Missing evidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <RequestsList
            rows={visible}
            loading={loading}
            user={user}
            readOnly={purchaseView}
            onStatusChange={changeStatus}
            onEdit={(row) => {
              setEditing(row);
              setFormOpen(true);
            }}
            onRemove={remove}
          />
        </TabsContent>
        {reviewer && (
          <TabsContent value="incoming" className="mt-3">
            <IncomingRequestsTab requests={incoming} onReview={setDeciding} />
          </TabsContent>
        )}
      </Tabs>

      <RequestFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        user={user}
        config={config}
        initialRecord={editing}
        onSaved={(result) => {
          const rec = result?.record || result;
          const isEdit = !!result?.isEdit;
          if (rec?.id) {
            if (result?.entityType === DOWNTIME_TYPE) {
              setDowntime((prev) => [rec, ...prev.filter((d) => d.id !== rec.id)]);
            } else if (result?.entityType) {
              setRequests((prev) => [rec, ...prev.filter((r) => r.id !== rec.id)]);
            }
          }
          toast.success(isEdit ? "Request updated successfully." : "Request submitted and saved.");
          load(true);
        }}
      />
      <FormSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        user={user}
        onSaved={() => loadFormConfig().then(setConfig)}
      />
      <RequestDecisionDialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        request={deciding}
        user={user}
        onSaved={() => load(true)}
      />
    </div>
  );
}