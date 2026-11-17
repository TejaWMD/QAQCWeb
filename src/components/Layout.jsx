import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Eye, LogOut, Menu } from "lucide-react";
import FactorySidebar from "@/components/factoryops/FactorySidebar";
import { useAuth } from "@/lib/AuthContext";
import { VIEW_AS_ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Layout() {
  const { user, viewAsRole, setViewAsRole, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const activeRole = VIEW_AS_ROLES.find((r) => r.key === viewAsRole);
  const logoSrc = `${import.meta.env.BASE_URL}wmd-logo.jpg`;

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white flex flex-col">
      <header className="sticky top-0 z-30 h-16 px-3 sm:px-5 bg-[#0e131d]/95 backdrop-blur-md border-b border-[#1e2740]/80 flex items-center gap-2.5 sm:gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          className="lg:hidden h-9 w-9 rounded-full text-[#cbd5e1] hover:text-white hover:bg-white/10 shrink-0"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div data-logo-badge="true" className="w-10 h-10 rounded-2xl bg-white p-0.5 ring-2 ring-[#00e5ff]/30 shadow-sm shrink-0 overflow-hidden">
            <img src={logoSrc} alt="WMD Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="text-white text-base sm:text-lg font-bold tracking-tight truncate">
            WMG QAQC
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-[#1e2740]">
              <div className="w-8 h-8 rounded-full bg-[#00e5ff]/15 text-[#00e5ff] ring-1 ring-[#00e5ff]/30 text-xs font-bold flex items-center justify-center shrink-0">
                {user.avatar_initials || "U"}
              </div>
              <div className="hidden md:block leading-tight max-w-[140px]">
                <p className="text-xs font-semibold text-white truncate">{user.name || user.full_name}</p>
                <p className="text-[11px] text-[#94a3b8] truncate">{user.role_label || user.role}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logout(true)}
                aria-label="Logout"
                className="h-8 px-2.5 sm:px-3 rounded-full bg-[#131926] border-[#1e2740] text-[#e2e8f0] hover:bg-[#ff4d4d]/15 hover:text-[#ff4d4d] hover:border-[#ff4d4d]/40 text-xs"
              >
                <LogOut className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          )}
        </div>
      </header>

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

      <div className="flex flex-1 min-w-0">
        <FactorySidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
