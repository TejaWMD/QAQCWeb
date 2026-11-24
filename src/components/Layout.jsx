import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Eye, Menu } from "lucide-react";
import FactorySidebar from "@/components/factoryops/FactorySidebar";
import { useAuth } from "@/lib/AuthContext";
import { VIEW_AS_ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

export default function Layout() {
  const { user, viewAsRole, setViewAsRole, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("factory_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const activeRole = VIEW_AS_ROLES.find((r) => r.key === viewAsRole);
  const logoSrc = `${import.meta.env.BASE_URL}wmd-logo.jpg`;

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("factory_sidebar_collapsed", String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#0a0e17] text-white flex">
      <FactorySidebar
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <div className="flex-1 min-w-0 flex flex-col h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="lg:hidden h-16 px-4 bg-[#0e131d] border-b border-[#1e2740] flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="h-9 w-9 rounded-full bg-[#131926] border border-[#1e2740] text-[#cbd5e1] hover:text-white hover:bg-[#1e2740] shrink-0"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <button
              type="button"
              onClick={() => logout(true)}
              title="Back to Main Hub"
              aria-label="Back to Main Hub"
              className="wmd-hub-logo-trigger flex items-center gap-2 min-w-0 text-left rounded-lg cursor-pointer focus:outline-none"
            >
              <div className="wmd-hub-logo-btn w-8 h-8 shrink-0">
                <img src={logoSrc} alt="WMD Logo" className="w-full h-full object-contain rounded" />
              </div>
              <span className="font-bold text-sm tracking-tight text-white truncate">WMG QAQC</span>
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <div className="w-8 h-8 rounded-full bg-[#00e5ff]/15 text-[#00e5ff] ring-1 ring-[#00e5ff]/30 text-xs font-bold flex items-center justify-center shrink-0">
                {user.avatar_initials || "U"}
              </div>
            )}
          </div>
        </div>

        {activeRole && (
          <div className="bg-[#ff9f43]/15 border-b border-[#ff9f43]/40 px-4 py-2 flex flex-wrap items-center gap-2.5">
            <Eye className="w-4 h-4 text-[#ff9f43] shrink-0" />
            <p className="text-xs sm:text-sm text-[#ff9f43] font-medium">
              Viewing as {activeRole.label}
            </p>
            <Button
              size="sm"
              onClick={() => setViewAsRole("")}
              className="ml-auto h-7 rounded-full bg-[#ff9f43] hover:bg-[#f58a1f] text-[#0a0e17] font-semibold text-xs px-3"
            >
              Exit
            </Button>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
