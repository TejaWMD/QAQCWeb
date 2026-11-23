import React from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { returnToPortalHub } from "@/services/authService";
import { ShieldAlert, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccessGate() {
  const { user, isAuthenticated, isLoadingAuth, authError } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e17]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.status === "suspended" || authError?.type === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] p-6">
        <div className="max-w-md w-full bg-[#0e131d] border border-[#1e2740] rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Access Suspended</h2>
          <p className="text-sm text-slate-400">
            An administrator has suspended your access to QAQC Web. Please contact an administrator if you believe this is a mistake.
          </p>
          <Button
            onClick={() => returnToPortalHub(true)}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Return to WMD Hub
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.id) {
    const isNotRegistered = authError?.type === "not_registered";
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] p-6">
        <div className="max-w-md w-full bg-[#0e131d] border border-[#1e2740] rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center mx-auto">
            {isNotRegistered ? <ShieldAlert className="w-6 h-6 text-amber-400" /> : <Lock className="w-6 h-6" />}
          </div>
          <h2 className="text-lg font-semibold text-white">
            {isNotRegistered ? "Access Restricted" : "WMD Hub Sign-In Required"}
          </h2>
          <p className="text-sm text-slate-400">
            {isNotRegistered
              ? "Your account does not have permission to access QAQC Web. Please contact an administrator."
              : "QAQC Web can only be accessed through WMD Hub. Please sign in and open QAQC Web from your workspace."}
          </p>
          <Button
            onClick={() => returnToPortalHub(isNotRegistered)}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isNotRegistered ? "Return to WMD Hub" : "Open WMD Hub"}
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
