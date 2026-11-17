import React from "react";
import { labelClass } from "@/components/planning/styles";

export default function Field({ label, hint, className = "", children }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#64748B]">{hint}</p>}
    </div>
  );
}