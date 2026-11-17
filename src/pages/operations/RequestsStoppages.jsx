import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName, isAdminUser } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Settings2 } from "lucide-react";
import RequestFormDialog from "@/components/requests/RequestFormDialog";
import FormSettingsDialog from "@/components/requests/FormSettingsDialog";
import RequestsList from "@/components/requests/RequestsList";
import IncomingRequestsTab from "@/components/requests/IncomingRequestsTab";
import RequestDecisionDialog from "@/components/requests/RequestDecisionDialog";
import {
  REQUEST_TYPES,
  DOWNTIME_TYPE,
  DOWNTIME_STATUSES,
  ITEM_STATUSES,
  APPROVAL_STATUSES,
  OPEN_REQUEST_STATUSES,
  canDecideRequests,
  coversTeam,
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
  const [deciding, setDeciding] = useState(null);
  const [purgingDemo, setPurgingDemo] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FORM_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState("all");

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [down, req] = await Promise.all([
        base44.entities.Downtime.list("-created_date", 200),
        base44.entities.Request.list("-created_date", 200),
      ]);
      setDowntime(down);
      setRequests(req);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    loadFormConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const u1 = base44.entities.Downtime.subscribe(() => load(true));
    const u2 = base44.entities.Request.subscribe(() => load(true));
    return () => {
      if (typeof u1 === "function") u1();
      if (typeof u2 === "function") u2();
    };
  }, []);

  const rows = useMemo(
    () => [
      ...downtime.map((d) => ({ ...d, _type: DOWNTIME_TYPE })),
      ...requests.map((r) => ({ ...r, _type: r.request_type })),
    ].sort(
      (a, b) =>
        (b.shift_date || "").localeCompare(a.shift_date || "") ||
        (b.created_date || "").localeCompare(a.created_date || "")
    ),
    [downtime, requests]
  );

  const visible = rows.filter(
    (r) =>
      (typeFilter === "all" || r._type === typeFilter) &&
      (statusFilter === "all" || r.status === statusFilter) &&
      (evidenceFilter === "all" ||
        (evidenceFilter === "has" ? (r.evidence_files || []).length > 0 : (r.evidence_files || []).length === 0))
  );

  // Incoming: routed to a team this member covers, still open, and not their own.
  const incoming = requests.filter(
    (r) => r.requester_id !== user?.id && coversTeam(user, r.owners) && OPEN_REQUEST_STATUSES.includes(r.status)
  );

  const reviewer = canDecideRequests(user);

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
    const prev = row.status || "";
    const entity = row._type === DOWNTIME_TYPE ? "Downtime" : "Request";
    await base44.entities[entity].update(row.id, { status });
    await audit("Updated", row.id, `Status changed to "${status}"`, prev, status);
    await load(true);
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this record?")) return;
    const entity = row._type === DOWNTIME_TYPE ? "Downtime" : "Request";
    await base44.entities[entity].delete(row.id);
    await audit("Deleted", row.id, "Record deleted");
    await load(true);
  };

  const purgeDemo = async () => {
    if (!window.confirm("Delete ALL demo / test downtime records? This cannot be undone.")) return;
    setPurgingDemo(true);
    try {
      await base44.entities.Downtime.deleteMany({ is_demo: true });
      await audit("Deleted", "", "All demo / test downtime records deleted");
      await load(true);
    } finally {
      setPurgingDemo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Requests &amp; Stoppages</h2>
          <p className="text-[#64748B] text-sm mt-1">Downtime stoppages, item / material and approval requests in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminUser(user) && (
            <Button
              variant="outline"
              disabled={purgingDemo}
              onClick={purgeDemo}
              className="bg-white border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-700"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete all demo records
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
          <Button onClick={() => setFormOpen(true)} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
            <Plus className="w-4 h-4 mr-1.5" /> New Request
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="bg-white border border-[#E2E8F0]">
          <TabsTrigger value="all" className="data-[state=active]:bg-[#EBF3FF] data-[state=active]:text-[#1D4ED8] text-[#64748B]">
            All Requests ({rows.length})
          </TabsTrigger>
          {reviewer && (
            <TabsTrigger value="incoming" className="data-[state=active]:bg-[#EBF3FF] data-[state=active]:text-[#1D4ED8] text-[#64748B]">
              Incoming Requests ({incoming.length})
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="all" className="space-y-3 mt-3">
          <div className="flex flex-wrap items-center gap-2">
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
          <RequestsList rows={visible} loading={loading} user={user} onStatusChange={changeStatus} onRemove={remove} />
        </TabsContent>
        {reviewer && (
          <TabsContent value="incoming" className="mt-3">
            <IncomingRequestsTab requests={incoming} onReview={setDeciding} />
          </TabsContent>
        )}
      </Tabs>

      <RequestFormDialog open={formOpen} onOpenChange={setFormOpen} user={user} config={config} onSaved={() => load(true)} />
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