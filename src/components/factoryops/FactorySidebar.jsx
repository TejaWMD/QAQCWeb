import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MODULES, canAccess, isAdminUser } from "@/lib/permissions";
import NotificationBell from "@/components/NotificationBell";
import {
  Radar, Clock, ShieldCheck, ClipboardList, AlertTriangle, ScrollText,
  LayoutDashboard, Users, Upload, Layers,
  ArrowLeftRight, ClipboardCheck, Package, FlaskConical, ListChecks,
  CalendarDays, Trash2, Tag, History, Scale, X, PanelLeftClose, PanelLeftOpen, TrendingUp, ShoppingCart, LayoutGrid, QrCode, MessageSquareText
} from "lucide-react";

const factoryItems = [
  { key: "attention_dashboard", label: "Attention Dashboard", icon: Radar },
  { key: "downtime", label: "Requests & Stoppages", icon: Clock },
  { key: "qa_haccp", label: "QA & HACCP Safety", icon: ShieldCheck },
  { key: "qaqc_queries", label: "Query Within Depts", icon: MessageSquareText },
  { key: "task_matrix", label: "Supervisor Tasks", icon: ClipboardList },
  { key: "capa_tracker", label: "CAPA Tracker", icon: AlertTriangle, badge: "capa" },
  { key: "audit_trail", label: "Audit Trail", icon: ScrollText },
];

const planningItems = [
  { key: "product_master", label: "Product Master", icon: Package },
  { key: "recipe_master", label: "Recipe Master", icon: FlaskConical },
  { key: "demand_planner", label: "Demand Planner", icon: TrendingUp },
  { key: "procurement", label: "Procurement (PR/PO)", icon: ShoppingCart },
  { key: "production_orders", label: "Production Orders", icon: ListChecks },
  { key: "production_schedule", label: "Schedule", icon: CalendarDays },
];

const productionItems = [
  { key: "create_batch", label: "Create Batch", icon: Tag },
  { key: "batch_records", label: "Batch Records", icon: History },
  { key: "batch_scan", label: "Barcode Lookup", icon: QrCode },
  { key: "production_line_logs", label: "Daily Packaging Entry", icon: LayoutDashboard },
  { key: "yield_loss", label: "Yield & Loss", icon: Scale },
];

const warehouseItems = [
  { key: "wms_warehouse", label: "Finished Goods WMS", icon: LayoutGrid },
  { key: "packaging_stock", label: "Packaging Stock", icon: Layers },
  { key: "packaging_movements", label: "Stock Movements", icon: ArrowLeftRight },
  { key: "packaging_approvals", label: "Stock Approvals", icon: ClipboardCheck },
];

const systemItems = [
  { key: "user_management", label: "Users", icon: Users, adminOnly: true },
  { key: "data_import", label: "Data Import", icon: Upload, adminOnly: true },
  { key: "recently_deleted", label: "Recently Deleted", icon: Trash2, adminOnly: true },
];

const pathOf = (key) => MODULES.find((m) => m.key === key)?.path;

export default function FactorySidebar({
  mobileOpen = false,
  onClose = () => {},
  collapsed = false,
  onToggleCollapse = () => {},
}) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [capaOpen, setCapaOpen] = useState(0);
  const logoSrc = `${import.meta.env.BASE_URL}wmd-logo.jpg`;

  useEffect(() => {
    let timer = null;
    const loadCount = async () => {
      try {
        setCapaOpen(await base44.entities.CAPA.count({ status: { $ne: "Verified" } }));
      } catch {
        setCapaOpen(0);
      }
    };
    const debouncedLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadCount, 300);
    };
    loadCount();
    const unsubscribe = base44.entities.CAPA.subscribe(debouncedLoad);
    return () => {
      if (timer) clearTimeout(timer);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const isCollapsed = collapsed && !mobileOpen;

  const renderSection = (title, items) => {
    const visible = items.filter((item) => (item.adminOnly ? isAdminUser(user) : canAccess(user, item.key)));
    if (visible.length === 0) return null;
    return (
      <div className={isCollapsed ? "px-2" : "px-3"}>
        {!isCollapsed ? (
          <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold tracking-widest text-[#8b9bb4] uppercase">
            {title}
          </p>
        ) : (
          <div className="my-2.5 mx-2 border-t border-[#1e2740]" />
        )}
        <nav className="space-y-1">
          {visible.map((item) => {
            const path = pathOf(item.key);
            const active = location.pathname === path;
            return (
              <Link
                key={`${item.key}-${item.label}`}
                to={path}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                aria-label={item.label}
                className={`relative flex items-center ${isCollapsed ? "w-10 h-10 mx-auto justify-center p-0 rounded-xl" : "gap-2.5 px-3 py-2 rounded-full"} text-sm transition-all duration-150 ${
                  active
                    ? "bg-[#2563eb]/20 text-[#60a5fa] font-semibold shadow-sm ring-1 ring-[#3b82f6]/30"
                    : "text-[#cbd5e1] hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`${isCollapsed ? "w-[18px] h-[18px]" : "w-4 h-4"} shrink-0`} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
                {item.badge === "capa" && capaOpen > 0 && (
                  isCollapsed ? (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ff4d4d] ring-2 ring-[#0e131d]" />
                  ) : (
                    <span className="ml-auto text-[10px] font-bold text-white bg-[#ff4d4d] rounded-full px-2 py-0.5 min-w-[20px] text-center">
                      {capaOpen}
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className={`flex items-center border-b border-[#1e2740] shrink-0 ${isCollapsed ? "flex-col justify-center gap-2 py-3 px-2" : "h-16 justify-between px-4"}`}>
        <button
          type="button"
          onClick={() => logout(true)}
          title="Back to Main Hub"
          aria-label="Back to Main Hub"
          className={`wmd-hub-logo-trigger flex items-center ${isCollapsed ? "justify-center" : "gap-2.5 min-w-0 text-left"} rounded-xl cursor-pointer focus:outline-none`}
        >
          <div data-logo-badge="true" className="wmd-hub-logo-btn w-9 h-9 shrink-0">
            <img src={logoSrc} alt="WMD Logo" className="w-full h-full object-contain rounded-lg" />
          </div>
          {!isCollapsed && (
            <span className="font-bold text-base tracking-tight text-white truncate">WMG QAQC</span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`hidden lg:flex items-center justify-center shrink-0 transition-colors ${
            isCollapsed
              ? "w-10 h-10 rounded-xl bg-[#131926] border border-[#1e2740] text-[#cbd5e1] hover:text-white hover:bg-[#1e2740]"
              : "w-7 h-7 rounded-full text-[#94a3b8] hover:text-white hover:bg-white/10"
          }`}
        >
          {isCollapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-[#cbd5e1] hover:text-white hover:bg-white/10 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
        {renderSection("Modules", factoryItems)}
        {renderSection("Planning", planningItems)}
        {renderSection("Production", productionItems)}
        {renderSection("Warehouse", warehouseItems)}
        {isAdminUser(user) && renderSection("System", systemItems)}
      </div>

      {user && (
        <div className={`mt-auto border-t border-[#1e2740] bg-[#0a0e17]/70 ${isCollapsed ? "p-2.5 flex flex-col items-center gap-2" : "px-4 py-3.5"}`}>
          <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "gap-2.5 min-w-0"}`}>
            <div
              title={isCollapsed ? (user.name || user.full_name || user.email || "User") : undefined}
              className="w-9 h-9 rounded-full bg-[#00e5ff]/15 text-[#00e5ff] ring-1 ring-[#00e5ff]/30 text-xs font-bold flex items-center justify-center shrink-0"
            >
              {user.avatar_initials || "U"}
            </div>
            {!isCollapsed && (
              <div className="leading-tight min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {user.name || user.full_name || user.email || "User"}
                </p>
                <p className="text-[11px] text-[#94a3b8] truncate">
                  {user.role_label || user.role}
                </p>
              </div>
            )}
            <NotificationBell compact />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0e131d] border-r border-[#1e2740] transition-all duration-200 ease-out lg:sticky lg:top-0 lg:z-auto ${
          isCollapsed ? "lg:w-20" : "lg:w-64"
        } lg:h-screen lg:translate-x-0 shrink-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
