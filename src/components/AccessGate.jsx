import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessGate() {
  const { user, isAuthenticated, isLoadingAuth, logout } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user?.id) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (user.status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Access suspended</h2>
          <p className="text-sm text-slate-400">
            An administrator has suspended your access to this app. Please contact an administrator if you believe this is a mistake.
          </p>
          <Button variant="outline" onClick={() => logout(true)} className="w-full">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
