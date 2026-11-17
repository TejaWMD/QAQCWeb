import React from "react";

const TONES = {
  white: "text-white",
  muted: "text-[#94a3b8]",
  green: "text-[#00ff9d]",
  red: "text-[#ff4d4d]",
  orange: "text-[#ff9f43]",
  cyan: "text-[#00e5ff]",
};

export default function KpiCard({ icon: Icon, title, value, valueSub, stats = [], alert = false, progress = null, onClick = null }) {
  const inner = (
    <>
      <div className="flex items-center gap-2.5 mb-3">
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-[#00e5ff]/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-[#00e5ff]" />
          </div>
        )}
        <span className="text-xs font-medium text-[#cbd5e1] leading-tight">{title}</span>
      </div>
      <div className="text-white text-xl font-bold leading-tight">{value}</div>
      {valueSub && <div className="text-[#94a3b8] text-xs mt-0.5">{valueSub}</div>}
      {stats.length > 0 && (
        <div className="mt-3 space-y-1">
          {stats.map((s, i) => (
            <div key={i} className={`text-xs font-medium ${TONES[s.tone] || TONES.white}`}>{s.text}</div>
          ))}
        </div>
      )}
      {progress && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-[#1e2740] overflow-hidden">
            <div
              className="h-full bg-[#00e5ff] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress.value))}%` }}
            />
          </div>
          {progress.label && <div className="text-[11px] text-[#94a3b8] mt-1">{progress.label}</div>}
        </div>
      )}
    </>
  );

  const base = `bg-[#131926] rounded-2xl p-4 border shadow-sm ${
    alert ? "border-[#ff4d4d]/70 ring-1 ring-[#ff4d4d]/20" : "border-[#1e2740]"
  }`;

  if (!onClick) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} text-left w-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00e5ff]/60 hover:shadow-md`}
    >
      {inner}
    </button>
  );
}
