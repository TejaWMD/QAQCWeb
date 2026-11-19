export function groupByDate(logs, dateField) {
  const groups = {};
  (logs || []).forEach((log) => {
    const raw = log?.[dateField];
    const date = raw ? String(raw).slice(0, 10) : "Undated";
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  });
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

export function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === "Undated") return "Undated";
  const clean = String(dateStr).slice(0, 10);
  const d = new Date(`${clean}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}