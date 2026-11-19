import React, { useRef, useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import {
  SLOT_MINUTES, atMinuteOfDay, fmtQty, fmtTime, localDateStr, minuteOfDay,
} from "@/lib/production";

const HOUR_PX = 64;
const PX_PER_MIN = HOUR_PX / 60;
const TOTAL_PX = 24 * HOUR_PX;
const HOURS = Array.from({ length: 25 }, (_, i) => i);

const BLOCK_STYLES = {
  Planned: "bg-sky-500/20 border-sky-400/50 text-sky-100",
  "In Progress": "bg-amber-500/20 border-amber-400/50 text-amber-100",
  Completed: "bg-emerald-500/20 border-emerald-400/50 text-emerald-100",
  Cancelled: "bg-slate-700/40 border-slate-600 text-slate-400 line-through",
};

const endMinuteOf = (order) => {
  if (!order.planned_end) return minuteOfDay(order.planned_start) + 60;
  const sameDay = localDateStr(order.planned_end) === localDateStr(order.planned_start);
  const raw = minuteOfDay(order.planned_end) + (sameDay ? 0 : 1440);
  return Math.min(1440, Math.max(minuteOfDay(order.planned_start) + SLOT_MINUTES, raw));
};

// Lays overlapping orders side by side so nothing is hidden behind another block.
const laneLayout = (list) => {
  const sorted = [...list].sort((a, b) => minuteOfDay(a.planned_start) - minuteOfDay(b.planned_start));
  const laneEnds = [];
  const placed = sorted.map((order) => {
    const startMin = minuteOfDay(order.planned_start);
    const endMin = endMinuteOf(order);
    let lane = laneEnds.findIndex((end) => end <= startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = endMin;
    const conflict = sorted.some((o) =>
      o.id !== order.id && o.status !== "Cancelled" && order.status !== "Cancelled" &&
      minuteOfDay(o.planned_start) < endMin && endMinuteOf(o) > startMin
    );
    return { order, startMin, endMin, lane, conflict };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
};

const Hours = () => (
  <>
    {HOURS.map((h) => (
      <div key={h} className="absolute left-0 right-0 border-t border-[#E2E8F0]" style={{ top: h * HOUR_PX }} />
    ))}
  </>
);

// Day timeline: one column per machine, 00:00–24:00 down the side. Blocks drag
// to another time or machine; the actual run shows as a green strip.
export default function ScheduleGrid({ machines = [], orders = [], dateStr, onOpen, onMoveRequest }) {
  const draggedRef = useRef(false);
  const [hoverMachine, setHoverMachine] = useState("");

  const ordersOf = (machineName) => orders.filter((o) => (o.machine || "") === machineName);

  const onDrop = (e, machine) => {
    e.preventDefault();
    setHoverMachine("");
    const id = e.dataTransfer.getData("text/plain");
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawMinutes = (e.clientY - rect.top) / PX_PER_MIN;
    const snapped = Math.min(1440 - SLOT_MINUTES, Math.max(0, Math.round(rawMinutes / SLOT_MINUTES) * SLOT_MINUTES));
    onMoveRequest?.(order, { machine, startIso: atMinuteOfDay(dateStr, snapped) });
  };

  if (!machines.length) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-[#64748B]">
        No machines for this location. Add them on the Machines page.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-auto max-h-[72vh]">
      <div className="flex min-w-max">
        <div className="w-14 shrink-0 sticky left-0 z-30 bg-white border-r border-[#E2E8F0]">
          <div className="h-11 sticky top-0 z-30 bg-[#F8FAFC] border-b border-[#E2E8F0]" />
          <div className="relative" style={{ height: TOTAL_PX }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-[#E2E8F0]" style={{ top: h * HOUR_PX }}>
                <span className="absolute right-1 -top-2 text-[10px] text-[#64748B]">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
        </div>

        {machines.map((machine) => {
          const { placed, lanes } = laneLayout(ordersOf(machine.name));
          const maintenance = machine.status === "Under Maintenance";
          return (
            <div key={machine.id} className="w-[230px] shrink-0 border-r border-[#E2E8F0]">
              <div className={`h-11 sticky top-0 z-20 border-b border-[#E2E8F0] px-2 flex items-center gap-1.5 ${maintenance ? "bg-[#2a1417]" : "bg-[#F8FAFC]"}`}>
                <span className="text-xs font-semibold text-[#0F294A] truncate" title={machine.name}>{machine.name}</span>
                {maintenance && <Wrench className="w-3 h-3 text-rose-600 shrink-0" />}
              </div>
              <div
                className={`relative ${maintenance ? "bg-rose-600/5" : ""} ${hoverMachine === machine.name ? "bg-[#EBF3FF]" : ""}`}
                style={{ height: TOTAL_PX }}
                onDragOver={(e) => { e.preventDefault(); setHoverMachine(machine.name); }}
                onDragLeave={() => setHoverMachine("")}
                onDrop={(e) => onDrop(e, machine)}
              >
                <Hours />
                {placed.map(({ order, startMin, endMin, lane, conflict }) => {
                  const widthPct = 100 / lanes;
                  const top = startMin * PX_PER_MIN;
                  const height = Math.max(26, (endMin - startMin) * PX_PER_MIN - 2);
                  const actualTop = order.actual_start ? minuteOfDay(order.actual_start) * PX_PER_MIN : null;
                  const actualHeight = order.actual_start && order.actual_end
                    ? Math.max(4, (minuteOfDay(order.actual_end) - minuteOfDay(order.actual_start)) * PX_PER_MIN)
                    : 6;
                  const label = `${order.product_code || ""} · ${order.product_name} · ${fmtTime(order.planned_start)}–${fmtTime(order.planned_end)} · ${order.batches || 1} batch(es) · ${(order.batch_codes || []).join(", ")} · ${fmtQty(order.quantity_cartons)} ctns`;
                  return (
                    <React.Fragment key={order.id}>
                      <div
                        draggable
                        title={label}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", order.id);
                          e.dataTransfer.effectAllowed = "move";
                          draggedRef.current = true;
                        }}
                        onDragEnd={() => { setTimeout(() => { draggedRef.current = false; }, 50); }}
                        onClick={() => { if (!draggedRef.current) onOpen?.(order); }}
                        className={`absolute rounded border px-1.5 py-1 overflow-hidden cursor-pointer hover:brightness-110 ${BLOCK_STYLES[order.status] || BLOCK_STYLES.Planned} ${conflict ? "ring-1 ring-[#E11D48]" : ""}`}
                        style={{ top, height, left: `calc(${lane * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                      >
                        <p className="text-[10px] leading-tight truncate font-semibold opacity-90">{order.product_code || "—"}</p>
                        <p className="text-[11px] leading-tight truncate">{order.product_name}</p>
                        {height > 52 && <p className="text-[10px] leading-tight opacity-80">{fmtTime(order.planned_start)}–{fmtTime(order.planned_end)}</p>}
                        {height > 52 && <p className="text-[10px] leading-tight opacity-80">{order.batches || 1} batch(es) · {fmtQty(order.quantity_cartons)} ctns</p>}
                        {height > 74 && (order.batch_codes || []).length > 0 && (
                          <p className="text-[10px] leading-tight opacity-70 truncate">{order.batch_codes.join(", ")}</p>
                        )}
                        {conflict && <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-rose-600" />}
                      </div>
                      {actualTop != null && (
                        <div
                          title={`Actual ${fmtTime(order.actual_start)}${order.actual_end ? `–${fmtTime(order.actual_end)}` : "–now"}`}
                          className="absolute h-1.5 rounded bg-emerald-500 pointer-events-none"
                          style={{ top: actualTop, height: Math.max(4, actualHeight), left: `calc(${lane * widthPct}% + 4px)`, width: `calc(${widthPct}% - 8px)`, opacity: 0.85 }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}