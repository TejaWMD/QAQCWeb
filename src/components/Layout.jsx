import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Eye, Menu } from "lucide-react";
import FactorySidebar from "@/components/factoryops/FactorySidebar";
import { useAuth } from "@/lib/AuthContext";
import { VIEW_AS_ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

export default function Layout() {
  const { viewAsRole, setViewAsRole } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeRole = VIEW_AS_ROLES.find((r) => r.key === viewAsRole);

  return (
    <div className="h-screen overflow-hidden bg-[#0a0e17] text-white flex">
      <FactorySidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto overflow-x-hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          className="lg:hidden fixed top-3 left-3 z-30 h-9 w-9 rounded-full bg-[#131926]/90 border border-[#1e2740] text-[#cbd5e1] hover:text-white hover:bg-[#1e2740] shadow-md backdrop-blur-sm"
        >
          <Menu className="w-5 h-5" />
        </Button>

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
