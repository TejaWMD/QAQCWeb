import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { appRoleOf, appRoleLabel } from "@/lib/permissions";
import { sweepOverdue } from "@/lib/overdue";
import { Button } from "@/components/ui/button";
import { ClipboardList, ClipboardCheck, AlertTriangle } from "lucide-react";
import KpiCard from "@/components/factoryops/KpiCard";
import DashboardFilterBar from "@/components/factoryops/DashboardFilterBar";
import CriticalAttentionTable from "@/components/factoryops/CriticalAttentionTable";
import PackagingLowStock from "@/components/packaging/PackagingLowStock";
import TodayScheduleSummary from "@/components/dashboard/TodayScheduleSummary";
import LossTodayTile from "@/components/yieldloss/LossTodayTile";
import ProductDataHealth from "@/components/productmaster/ProductDataHealth";

const ENTITIES = ["Downtime", "QualityDefect", "ProductHold", "Task", "CAPA"];
const VERIFIED = ["Verified", "Resolved", "Released", "Completed"];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (n || 0).toLocaleString("en-US");

const EMPTY_DATA = {
  down: [],
  defects: [],
  holds: [],
  tasks: [],
  capas: [],
};

const isVerified = (r) => VERIFIED.includes(r.status);
const isOverdue = (r, today) => !isVerified(r) && !!r.due_date && String(r.due_date).slice(0, 10) < today;
const isActiveHold = (r) => !["Completed", "Verified"].includes(r.status);

export default function AttentionDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filters, setFilters] = useState({ date: todayISO(), shift: "all", line: "all", status: "all" });
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const f = filtersRef.current;
      const q = { shift_date: f.date };
      if (f.shift !== "all") q.shift_type = f.shift;
      const opt = { limit: 200 };
      const [down, defects, holds, tasks, capas] = await Promise.all([
        base44.entities.Downtime.filter(q, opt).then((p) => (p?.items || []).filter((r) => !r.is_demo)).catch(() => []),
        base44.entities.QualityDefect.filter(q, opt).then((p) => p?.items || []).catch(() => []),
        base44.entities.ProductHold.filter({ status: { $ne: "Verified" } }, opt).then((p) => p?.items || []).catch(() => []),
        base44.entities.Task.list("-created_date", 200).then((p) => (Array.isArray(p) ? p : p?.items || [])).catch(() => []),
        base44.entities.CAPA.list("-created_date", 200).then((p) => (Array.isArray(p) ? p : p?.items || [])).catch(() => []),
      ]);
      setData({ down, defects, holds, tasks, capas });
    } catch (err) {
      console.warn("Could not load attention dashboard data:", err);
      setData(EMPTY_DATA);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    sweepOverdue().catch(() => {}).finally(() => load());
  }, [filters.date, filters.shift]);

  useEffect(() => {
    const reload = () => load(true);
    const subs = ENTITIES.map((name) => {
      try {
        return base44.entities[name]?.subscribe?.(reload);
      } catch {
        return null;
      }
    });
    return () => subs.forEach((u) => { if (typeof u === "function") u(); });
  }, []);

  const { date, shift, line, status } = filters;

  const view = useMemo(() => {
    const d = data || EMPTY_DATA;
    const today = date;
    const matchesScope = (r) => (line === "all" || !r.production_line || r.production_line === line);
    const matchesStatus = (r) => {
      if (status === "all") return true;
      if (status === "Verified") return isVerified(r);
      if (status === "Overdue") return isOverdue(r, today) || r.status === "Overdue";
      return !isVerified(r) && !isOverdue(r, today);
    };
    const scope = (list) => (list || []).filter((r) => matchesScope(r) && matchesStatus(r));

    const down = scope(d.down);
    const defects = scope(d.defects);
    const holds = scope(d.holds);
    const tasks = scope(d.tasks);
    const capas = scope(d.capas);

    const defectQty = defects.reduce((s, r) => s + (r.defect_qty || 0), 0);
    const activeHolds = holds.filter(isActiveHold).length;
    const openCapas = capas.filter((r) => !isVerified(r)).length;

    const attention = [...tasks, ...capas];
    const overdueActions = attention.filter((r) => isOverdue(r, today) || r.status === "Overdue").length;
    const dueToday = attention.filter((r) => !isVerified(r) && String(r.due_date || "").slice(0, 10) === today).length;
    const verifiedActions = attention.filter((r) => isVerified(r)).length;

    // Attention Required: only CAPA Tracker entries and Requests & Stoppages
    const critical = [];
    capas.forEach((r) => {
      if (!isVerified(r)) {
        critical.push({
          item: r.title,
          module: "CAPA Tracker",
          owner: r.owner,
          due: r.due_date || r.shift_date,
          status: r.status === "Overdue" || isOverdue(r, today) ? "Overdue" : "Pending Verification",
          path: "/capa-tracker",
        });
      }
    });
    down.forEach((r) => {
      if (r.status === "Open") {
        critical.push({
          item: r.reason,
          module: "Requests & Stoppages",
          owner: r.owner,
          due: r.shift_date,
          status: "Open",
          path: "/downtime",
        });
      }
    });
    critical.sort((a, b) => {
      const ao = a.status === "Overdue" ? 0 : 1;
      const bo = b.status === "Overdue" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.due || "").localeCompare(b.due || "");
    });

    return { defectQty, activeHolds, openCapas, overdueActions, dueToday, verifiedActions, critical };
  }, [data, date, shift, line, status]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17]">
        <div className="w-8 h-8 border-4 border-[#1e2740] border-t-[#00e5ff] rounded-full animate-spin" />
      </div>
    );
  }

  const role = appRoleOf(user);

  return (
    <div className="min-h-screen bg-[#0a0e17] p-3 sm:p-5 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold">
          {role === "admin" ? "Admin" : role ? appRoleLabel(role) : "Custom"}
        </span>
      </div>

      <DashboardFilterBar
        date={date}
        shift={shift}
        line={line}
        status={status}
        onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onReset={() => setFilters({ date: todayISO(), shift: "all", line: "all", status: "all" })}
      />

      {view.activeHolds > 0 && (
        <div className="bg-[#ff4d4d]/10 border border-[#ff4d4d]/60 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#ff4d4d] shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <h3 className="text-[#ff4d4d] text-sm font-semibold">Quality Alert</h3>
            <p className="text-[#e2e8f0] text-xs mt-0.5">
              {view.activeHolds} active hold{view.activeHolds === 1 ? "" : "s"}
            </p>
          </div>
          <Button size="sm" onClick={() => navigate("/qa-haccp?tab=holds")} className="bg-[#ff4d4d] hover:bg-[#e63b3b] text-white">
            Review
          </Button>
        </div>
      )}

      <TodayScheduleSummary />

      <ProductDataHealth />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <LossTodayTile />
        <PackagingLowStock />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard
          icon={ClipboardCheck}
          title="Quality & CAPA"
          value={`${fmt(view.openCapas)} Open CAPAs`}
          stats={[
            { text: `${view.defectQty} Defects`, tone: "white" },
            { text: `${view.activeHolds} Active Holds`, tone: view.activeHolds > 0 ? "red" : "green" },
          ]}
          onClick={() => navigate("/capa-tracker")}
        />
        <KpiCard
          icon={ClipboardList}
          title="Attention Actions"
          value={`${view.overdueActions} Overdue`}
          alert={view.overdueActions > 0}
          stats={[
            { text: `${view.dueToday} Due Today`, tone: "white" },
            { text: `${view.verifiedActions} Verified`, tone: "green" },
          ]}
          onClick={() => navigate("/task-matrix?status=Overdue")}
        />
      </div>

      <CriticalAttentionTable items={view.critical} onOpen={(item) => navigate(item.path)} />
    </div>
  );
}
