import React from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { fmtDay } from "@/lib/labels";
import { fmtDuration } from "@/lib/production";
import { panelClass, labelClass } from "@/components/planning/styles";

// Downtime events logged on this machine while the batch was running.
export default function BatchDowntimeList({ events = [] }) {
  return (
    <div className={`${panelClass} p-4`}>
      <p className={`${labelClass} flex items-center gap-1 mb-2`}>
        <Clock className="w-3 h-3" /> Machine downtime in this batch window
      </p>
      {events.length === 0 ? (
        <p className="text-xs text-[#64748B]">No downtime was logged on this machine during the production window.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-b border-[#E2E8F0] last:border-0 pb-1.5 last:pb-0">
              <span className="text-[#0F294A] font-semibold whitespace-nowrap">
                {event.start_time || "—"}–{event.end_time || "open"}
              </span>
              <span className="text-[#64748B]">{fmtDay(event.shift_date)}</span>
              <span className="text-amber-700">{event.category || "Downtime"}</span>
              <span className="text-[#64748B]">{event.duration_min ? fmtDuration(event.duration_min) : ""}</span>
              <span className="text-[#64748B] flex-1 min-w-[160px] truncate">{event.reason || "—"}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                event.status === "Resolved"
                  ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                  : "text-rose-600 border-rose-300 bg-rose-600/10"
              }`}>
                {event.status || "Open"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 && (
        <Link to="/downtime" className="inline-block mt-2 text-[11px] text-[#1D4ED8] hover:underline">
          Open Requests &amp; Stoppages
        </Link>
      )}
    </div>
  );
}