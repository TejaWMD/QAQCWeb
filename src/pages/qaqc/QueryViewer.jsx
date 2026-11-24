import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMutthaQueries,
  subscribeToMutthaQueries,
  WMD_HUB_URL,
} from "@/lib/managerSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";

const STATUS_FILTERS = [
  { key: "all", label: "All Status" },
  { key: "Pending", label: "Pending" },
  { key: "Completed", label: "Completed" },
];

const RELATION_FILTERS = [
  { key: "all", label: "All" },
  { key: "to", label: "To Muttha" },
  { key: "from", label: "From Muttha" },
  { key: "cc", label: "CC'd" },
];

const RELATION_META = {
  to: {
    label: "To Muttha",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: Inbox,
  },
  from: {
    label: "From Muttha",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    icon: Send,
  },
  cc: {
    label: "CC'd",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    icon: Users,
  },
};

function FilterPills({ options, value, onChange, activeClass }) {
  return (
    <div className="flex flex-wrap items-center bg-[#131926] border border-[#1e2740] rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            value === opt.key
              ? activeClass
              : "text-[#94a3b8] hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RemarkBox({ label, accent, doneLabel, title, text, emptyText }) {
  return (
    <div className="rounded-lg bg-[#131926]/60 border border-[#1e2740]/70 p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] uppercase tracking-wider font-semibold ${accent}`}>
          {label}
        </span>
        {doneLabel && (
          <span className="text-[10px] font-medium text-emerald-400">
            {doneLabel}
          </span>
        )}
      </div>
      {title && <p className="text-xs font-semibold text-white">{title}</p>}
      {text ? (
        <p className="text-xs sm:text-sm text-[#cbd5e1] whitespace-pre-wrap leading-relaxed">
          {text}
        </p>
      ) : (
        <p className="text-xs italic text-[#64748b]">{emptyText}</p>
      )}
    </div>
  );
}

export default function QueryViewer() {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [relationFilter, setRelationFilter] = useState("all");
  const [selectedQuery, setSelectedQuery] = useState(null);

  const loadQueries = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    const result = await fetchMutthaQueries();
    if (result.error) {
      setErrorState({
        message: result.error,
        isMissingView: result.isMissingView,
      });
    } else {
      setQueries(result.queries);
      setErrorState(null);
      setLastUpdated(new Date());
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadQueries(false);
    const unsubscribe = subscribeToMutthaQueries(() => loadQueries(true));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [loadQueries]);

  const stats = useMemo(() => {
    let pending = 0;
    let completed = 0;
    let urgentOrDelayed = 0;

    for (const q of queries) {
      if (q.status === "Completed") completed++;
      else if (q.status === "Pending") {
        pending++;
        if (q.isUrgent || q.isDelayed) urgentOrDelayed++;
      }
    }

    return { total: queries.length, pending, completed, urgentOrDelayed };
  }, [queries]);

  const filteredQueries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return queries.filter((q) => {
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (relationFilter !== "all" && q.relation !== relationFilter) return false;
      if (!needle) return true;

      return [
        q.queryId,
        q.queryTitle,
        q.queryText,
        q.senderName,
        q.managerName,
        q.managerRemarkTitle,
        q.managerRemark,
        q.senderRemarkTitle,
        q.senderRemark,
        q.status,
        q.createdAt,
        q.completedAt,
        ...q.ccUsers.map((u) => u?.name || u?.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [queries, search, statusFilter, relationFilter]);

  const kpiCards = [
    { label: "Total Queries", value: stats.total, labelTone: "text-[#8b9bb4]", valueTone: "text-white" },
    { label: "Pending", value: stats.pending, labelTone: "text-amber-400/90", valueTone: "text-amber-300" },
    { label: "Completed", value: stats.completed, labelTone: "text-emerald-400/90", valueTone: "text-emerald-300" },
    { label: "Urgent / Delayed", value: stats.urgentOrDelayed, labelTone: "text-rose-400/90", valueTone: "text-rose-300" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e17] p-3 sm:p-5 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/15 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] shrink-0">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              QAQC Queries
            </h1>
            <p className="text-xs text-[#94a3b8]">
              Read-only sync of Muttha queries · Submit or reply in the{" "}
              <a
                href={WMD_HUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#60a5fa] hover:underline font-medium"
              >
                Query Portal
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && (
            <span className="text-[11px] text-[#64748b]">
              Synced {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadQueries(true)}
            disabled={refreshing}
            className="h-8 rounded-lg bg-[#131926] border-[#1e2740] text-[#e2e8f0] hover:bg-[#1e2740] hover:text-white gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <a
            href={WMD_HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#2563eb]/20 border border-[#3b82f6]/40 text-[#60a5fa] hover:bg-[#2563eb]/30 hover:text-white text-xs font-medium transition-colors"
          >
            <span>Query Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl bg-[#0e131d] border border-[#1e2740] px-4 py-3"
          >
            <p className={`text-[11px] uppercase tracking-wider font-semibold ${kpi.labelTone}`}>
              {kpi.label}
            </p>
            <p className={`text-2xl font-bold mt-0.5 ${kpi.valueTone}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-xl bg-[#0e131d] border border-[#1e2740] p-3 flex flex-col lg:flex-row gap-2.5 lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, title, sender, manager, or remark..."
            className="pl-9 h-8 bg-[#131926] border-[#1e2740] text-white placeholder:text-[#64748b] text-xs sm:text-sm rounded-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
            activeClass="bg-[#2563eb]/25 text-[#60a5fa] ring-1 ring-[#3b82f6]/40"
          />
          <FilterPills
            options={RELATION_FILTERS}
            value={relationFilter}
            onChange={setRelationFilter}
            activeClass="bg-[#00e5ff]/15 text-[#00e5ff] ring-1 ring-[#00e5ff]/35"
          />
        </div>
      </div>

      {/* Error State */}
      {errorState && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-200 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-rose-300 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {errorState.isMissingView
                ? "Read-only view not created in ManagerDashboard Supabase yet"
                : "Unable to load queries"}
            </span>
          </div>
          <p className="text-rose-200/90 leading-relaxed">
            {errorState.isMissingView ? (
              <>
                Run{" "}
                <code className="px-1.5 py-0.5 rounded bg-black/40">
                  supabase/qaqc_muttha_queries_view.sql
                </code>{" "}
                once in your ManagerDashboard Supabase SQL Editor, then click Refresh.
              </>
            ) : (
              errorState.message
            )}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && !errorState && (
        <div className="rounded-xl bg-[#0e131d] border border-[#1e2740] py-14 flex flex-col items-center justify-center gap-3 text-[#94a3b8]">
          <div className="w-7 h-7 border-4 border-[#1e2740] border-t-[#00e5ff] rounded-full animate-spin" />
          <p className="text-xs sm:text-sm">Loading QAQC queries...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !errorState && filteredQueries.length === 0 && (
        <div className="rounded-xl bg-[#0e131d] border border-[#1e2740] py-14 text-center space-y-1.5">
          <MessageSquareText className="w-7 h-7 text-[#475569] mx-auto" />
          <p className="text-sm font-medium text-white">No matching queries</p>
          <p className="text-xs text-[#64748b]">
            Clear the search input or adjust your status/direction filters.
          </p>
        </div>
      )}

      {/* Query Cards */}
      {!loading && !errorState && filteredQueries.length > 0 && (
        <div className="space-y-3">
          {filteredQueries.map((q) => {
            const rel = RELATION_META[q.relation] || RELATION_META.to;
            const RelIcon = rel.icon;
            const isCompleted = q.status === "Completed";
            const ccList = q.ccUsers.map((u) => u?.name || u?.email).filter(Boolean).join(", ");

            return (
              <div
                key={q.queryId}
                className="rounded-xl bg-[#0e131d] border border-[#1e2740] hover:border-[#334155] transition-colors p-4 space-y-3"
              >
                {/* Top Meta Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#1e2740]/80">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#131926] border border-[#1e2740] text-[#00e5ff]">
                      {q.queryId}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        isCompleted
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {q.status}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${rel.badge}`}
                    >
                      <RelIcon className="w-3 h-3" />
                      {rel.label}
                    </span>

                    {q.isUrgent && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/35">
                        <Flame className="w-3 h-3" />
                        Urgent
                      </span>
                    )}

                    {q.isDelayed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/35">
                        <AlertTriangle className="w-3 h-3" />
                        Delayed
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
                    <span>
                      Created <span className="text-[#e2e8f0]">{q.createdAt || "—"}</span>
                    </span>
                    {q.completedAt && (
                      <span>
                        Completed <span className="text-emerald-300">{q.completedAt}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedQuery(q)}
                      className="font-medium text-[#60a5fa] hover:text-[#93c5fd] hover:underline"
                    >
                      Details
                    </button>
                  </div>
                </div>

                {/* Routing Line */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#94a3b8]">
                  <span className="font-semibold text-white">{q.senderName}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#64748b]" />
                  <span className="font-semibold text-white">{q.managerName}</span>
                  {ccList && <span>· CC: {ccList}</span>}
                </div>

                {/* Query Content */}
                <div className="space-y-1">
                  {q.queryTitle && (
                    <p className="text-sm font-semibold text-white">{q.queryTitle}</p>
                  )}
                  <p className="text-xs sm:text-sm text-[#e2e8f0] whitespace-pre-wrap leading-relaxed">
                    {q.queryText || "—"}
                  </p>
                </div>

                {/* Remarks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-0.5">
                  <RemarkBox
                    label={`Manager Remark · ${q.managerName}`}
                    accent="text-sky-400"
                    doneLabel={q.managerDone ? "Marked Done" : null}
                    title={q.managerRemarkTitle}
                    text={q.managerRemark}
                    emptyText="No manager remark yet."
                  />
                  <RemarkBox
                    label={`Sender Remark · ${q.senderName}`}
                    accent="text-violet-400"
                    doneLabel={q.senderDone ? "Verified Done" : null}
                    title={q.senderRemarkTitle}
                    text={q.senderRemark}
                    emptyText="No sender remark yet."
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Details Dialog */}
      <Dialog
        open={Boolean(selectedQuery)}
        onOpenChange={(open) => !open && setSelectedQuery(null)}
      >
        <DialogContent className="max-w-2xl bg-[#0e131d] border-[#1e2740] text-white max-h-[85vh] overflow-y-auto">
          {selectedQuery && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                  <span className="font-mono text-sm text-[#00e5ff]">
                    {selectedQuery.queryId}
                  </span>
                  <span>{selectedQuery.queryTitle || "Query Details"}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3.5 text-sm pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-[#131926] border border-[#1e2740] rounded-lg p-3">
                  <div>
                    <span className="text-[#64748b]">From:</span>{" "}
                    <span className="font-semibold text-white">{selectedQuery.senderName}</span>
                  </div>
                  <div>
                    <span className="text-[#64748b]">To:</span>{" "}
                    <span className="font-semibold text-white">{selectedQuery.managerName}</span>
                  </div>
                  <div>
                    <span className="text-[#64748b]">Created:</span>{" "}
                    <span className="text-[#e2e8f0]">{selectedQuery.createdAt || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[#64748b]">Completed:</span>{" "}
                    <span className="text-emerald-300">
                      {selectedQuery.completedAt || "Pending"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748b]">Status:</span>{" "}
                    <span className="font-semibold text-white">{selectedQuery.status}</span>
                  </div>
                  {selectedQuery.ccUsers.length > 0 && (
                    <div className="sm:col-span-2">
                      <span className="text-[#64748b]">CC:</span>{" "}
                      <span className="text-[#cbd5e1]">
                        {selectedQuery.ccUsers
                          .map((u) => u?.name || u?.email)
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                <RemarkBox
                  label="Query"
                  accent="text-[#8b9bb4]"
                  text={selectedQuery.queryText}
                  emptyText="—"
                />

                <RemarkBox
                  label="Manager Remark"
                  accent="text-sky-400"
                  title={selectedQuery.managerRemarkTitle}
                  text={selectedQuery.managerRemark}
                  emptyText="No manager remark yet."
                />

                <RemarkBox
                  label="Sender Remark"
                  accent="text-violet-400"
                  title={selectedQuery.senderRemarkTitle}
                  text={selectedQuery.senderRemark}
                  emptyText="No sender remark yet."
                />

                {selectedQuery.remarksLog.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[#8b9bb4]">
                      Remarks History ({selectedQuery.remarksLog.length})
                    </p>
                    <div className="space-y-2">
                      {selectedQuery.remarksLog.map((rmk, idx) => (
                        <div
                          key={rmk.id || idx}
                          className="bg-[#131926]/60 border border-[#1e2740]/70 rounded-lg p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-[#94a3b8]">
                            <span className="font-semibold text-white">
                              {rmk.authorName || "User"}{" "}
                              <span className="font-normal text-[#64748b]">
                                ({rmk.type === "manager" ? "Manager" : "Sender"})
                              </span>
                            </span>
                            <span>{rmk.createdAt || ""}</span>
                          </div>
                          {rmk.title && (
                            <p className="font-semibold text-[#e2e8f0]">{rmk.title}</p>
                          )}
                          <p className="text-[#cbd5e1] whitespace-pre-wrap">{rmk.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}