import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MODULES, canAccess, isAdminUser } from "@/lib/permissions";
import {
  Radar, Clock, ShieldCheck, ClipboardList, AlertTriangle, ScrollText,
  LayoutDashboard, Users, Upload, PackagePlus, Boxes, PackageMinus, Layers,
  ArrowLeftRight, ClipboardCheck, Package, FlaskConical, ListChecks,
  CalendarDays, Trash2, Tag, History, Scale, X
} from "lucide-react";

const factoryItems = [
  { key: "attention_dashboard", label: "Attention Dashboard", icon: Radar },
  { key: "downtime", label: "Requests & Stoppages", icon: Clock },
  { key: "qa_haccp", label: "QA & HACCP Safety", icon: ShieldCheck },
  { key: "task_matrix", label: "Supervisor Tasks", icon: ClipboardList },
  { key: "capa_tracker", label: "CAPA Tracker", icon: AlertTriangle, badge: "capa" },
  { key: "audit_trail", label: "Audit Trail", icon: ScrollText },
];

const planningItems = [
  { key: "pic_product_entry", label: "PIC Product Entry", icon: PackagePlus },
  { key: "product_master", label: "Product Master", icon: Package },
  { key: "recipe_master", label: "Recipe Master", icon: FlaskConical },
  { key: "production_orders", label: "Production Orders", icon: ListChecks },
  { key: "production_schedule", label: "Schedule", icon: CalendarDays },
];

const productionItems = [
  { key: "create_batch", label: "Create Batch", icon: Tag },
  { key: "batch_records", label: "Batch Records", icon: History },
  { key: "production_line_logs", label: "Line Logs", icon: LayoutDashboard },
  { key: "yield_loss", label: "Yield & Loss", icon: Scale },
];

const warehouseItems = [
  { key: "warehouse_receiving", label: "Goods Receiving", icon: PackagePlus },
  { key: "goods_issued", label: "Goods Issued", icon: PackageMinus },
  { key: "goods_tracker", label: "Goods Tracker", icon: Boxes },
  { key: "packaging_stock", label: "Packaging Stock", icon: Layers },
  { key: "packaging_movements", label: "Stock Movements", icon: ArrowLeftRight },
  { key: "packaging_approvals", label: "Stock Approvals", icon: ClipboardCheck },
];

const systemItems = [
  { key: "user_management", label: "Users", icon: Users, adminOnly: true },
  { key: "data_import", label: "Import CSV", icon: Upload, adminOnly: true },
  { key: "recently_deleted", label: "Recently Deleted", icon: Trash2, adminOnly: true },
];

const pathOf = (key) => MODULES.find((m) => m.key === key)?.path;

export default function FactorySidebar({ mobileOpen = false, onClose = () => {} }) {
  const location = useLocation();
  const { user } = useAuth();
  const [capaOpen, setCapaOpen] = useState(0);
  const logoSrc = `${import.meta.env.BASE_URL}wmd-logo.jpg`;

  useEffect(() => {
    const loadCount = async () => {
      try {
        setCapaOpen(await base44.entities.CAPA.count({ status: { $ne: "Verified" } }));
      } catch {
        setCapaOpen(0);
      }
    };
    loadCount();
    const unsubscribe = base44.entities.CAPA.subscribe(loadCount);
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  const hour = new Date().getHours();
  const shiftLabel = hour >= 6 && hour < 18 ? "Shift A (Day)" : "Shift B (Night)";

  const renderSection = (title, items) => {
    const visible = items.filter((item) => (item.adminOnly ? isAdminUser(user) : canAccess(user, item.key)));
    if (visible.length === 0) return null;
    return (
      <div className="px-3">
        <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold tracking-widest text-[#8b9bb4] uppercase">
          {title}
        </p>
        <nav className="space-y-1">
          {visible.map((item) => {
            const path = pathOf(item.key);
            const active = location.pathname === path;
            return (
              <Link
                key={`${item.key}-${item.label}`}
                to={path}
                onClick={onClose}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-full transition-all duration-150 ${
                  active
                    ? "bg-[#00e5ff]/15 text-[#00e5ff] font-semibold shadow-sm ring-1 ring-[#00e5ff]/30"
                    : "text-[#cbd5e1] hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge === "capa" && capaOpen > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-white bg-[#ff4d4d] rounded-full px-2 py-0.5 min-w-[20px] text-center">
                    {capaOpen}
                  </span>
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
      <div className="lg:hidden flex items-center justify-between px-4 py-3.5 border-b border-[#1e2740]">
        <div className="flex items-center gap-2.5">
          <div data-logo-badge="true" className="w-8 h-8 rounded-xl bg-white p-0.5 overflow-hidden">
            <img src={logoSrc} alt="WMD Logo" className="w-full h-full object-contain rounded-lg" />
          </div>
          <span className="font-heading font-bold text-sm text-white">WMG Factory</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#cbd5e1] hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {renderSection("Modules", factoryItems)}
        {renderSection("Planning", planningItems)}
        {renderSection("Production", productionItems)}
        {renderSection("Warehouse", warehouseItems)}
        {isAdminUser(user) && renderSection("System", systemItems)}
      </div>

      <div className="px-4 py-3.5 border-t border-[#1e2740] bg-[#0a0e17]/40">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00ff9d] animate-pulse shrink-0" />
          <span className="text-xs font-medium text-white truncate">{shiftLabel}</span>
        </div>
        <p className="text-[11px] text-[#94a3b8] mt-1 truncate">
          {user?.full_name || user?.email || "—"}
        </p>
      </div>
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
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0e131d] border-r border-[#1e2740] transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] shrink-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
