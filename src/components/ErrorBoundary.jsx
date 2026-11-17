import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-xl p-6 text-center text-[#0F294A]">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-xs text-[#64748B] mb-6">
              {this.state.error?.message || "An unexpected error occurred while rendering this page."}
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                className="border-[#E2E8F0] text-slate-200 hover:bg-[#1a2234]"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Reload Page
              </Button>
              <Button
                className="bg-[#0F294A] text-white hover:bg-[#00c3d7]"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
