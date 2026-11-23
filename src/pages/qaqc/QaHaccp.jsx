import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { appRoleOf } from "@/lib/permissions";
import RaiseCapaButton from "@/components/qaqc/RaiseCapaButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import {
  DEFAULT_HACCP_DOCS,
  DEFAULT_IMPORTANT_DATES,
  DEFAULT_QC_STATE,
  DEFAULT_RETENTION_SAMPLES,
  loadQaSection,
  saveQaSection,
} from "@/lib/qaHaccpStore";

const DATE_CATEGORIES = [
  { key: "Audit or drill", dot: "bg-violet-400", bar: "bg-violet-500/80", label: "Audit or drill" },
  { key: "Certification", dot: "bg-sky-400", bar: "bg-sky-500/80", label: "Certification" },
  { key: "Document due", dot: "bg-amber-400", bar: "bg-amber-500/80", label: "Document due" },
  { key: "Visit or training", dot: "bg-emerald-400", bar: "bg-emerald-500/80", label: "Visit or training" },
];

const DOC_STATUSES = ["In progress", "Due soon", "Overdue", "Done"];

const STATUS_PILL = {
  "In progress": "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  "Due soon": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  Done: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  "Report pending": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
};

const fmtShortDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const fmtLongDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const daysDiff = (targetIso) => {
  if (!targetIso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(`${String(targetIso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  return Math.round((t.getTime() - today.getTime()) / 86400000);
};

export default function QaHaccp() {
  const { user } = useAuth();
  const role = appRoleOf(user);
  // User: QAQC Team ONLY. Can be Viewed by MD (and Admin)
  const canRaiseCapa = !role || ["admin", "qa_officer"].includes(role);
  const canEditQa = !role || ["admin", "qa_officer"].includes(role);

  const [tab, setTab] = useState("certifications");
  const [docs, setDocs] = useState([]);
  const [dates, setDates] = useState([]);
  const [samples, setSamples] = useState([]);
  const [qcState, setQcState] = useState(DEFAULT_QC_STATE);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [calMode, setCalMode] = useState("month");
  const [calCursor, setCalCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Modals
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [newDate, setNewDate] = useState({ title: "", category: "Document due", date: "" });

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ document_name: "", pic: "", remarks: "", due_date: "", status: "In progress" });

  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [newSample, setNewSample] = useState({ sample_id: "", product: "", batch_number: "", cooked_date: "", location: "", keep_until: "" });

  const [locationTarget, setLocationTarget] = useState(null);
  const [locationInput, setLocationInput] = useState("");

  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [customMenuForm, setCustomMenuForm] = useState({ productCode: "", name: "", prep: "About 20 min" });
  const [selectedMenus, setSelectedMenus] = useState({});

  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      loadQaSection("docs", DEFAULT_HACCP_DOCS),
      loadQaSection("dates", DEFAULT_IMPORTANT_DATES),
      loadQaSection("samples", DEFAULT_RETENTION_SAMPLES),
      loadQaSection("qc", DEFAULT_QC_STATE),
      base44.entities.BatchRecord.list("-created_date", 100).catch(() => []),
    ]).then(([d, dt, smp, qc, br]) => {
      setDocs(Array.isArray(d) ? d : DEFAULT_HACCP_DOCS);
      setDates(Array.isArray(dt) ? dt : DEFAULT_IMPORTANT_DATES);
      setSamples(Array.isArray(smp) ? smp : DEFAULT_RETENTION_SAMPLES);
      setQcState(qc && typeof qc === "object" ? { ...DEFAULT_QC_STATE, ...qc } : DEFAULT_QC_STATE);
      setBatches(Array.isArray(br) ? br : []);
      setLoading(false);
    });
  }, []);

  const persistDocs = (next) => {
    setDocs(next);
    saveQaSection("docs", next);
  };
  const persistDates = (next) => {
    setDates(next);
    saveQaSection("dates", next);
  };
  const persistSamples = (next) => {
    setSamples(next);
    saveQaSection("samples", next);
  };
  const persistQc = (next) => {
    setQcState(next);
    saveQaSection("qc", next);
  };

  // KPI metrics
  const doneDocsCount = docs.filter((d) => d.status === "Done").length;
  const pctDone = docs.length ? Math.round((doneDocsCount / docs.length) * 100) : 0;
  const dueIn7Days = dates.filter((d) => {
    const diff = daysDiff(d.date);
    return diff !== null && diff >= 0 && diff <= 7;
  }).length;
  const overdueDatesCount = dates.filter((d) => {
    const diff = daysDiff(d.date);
    return diff !== null && diff < 0;
  }).length + docs.filter((d) => d.status === "Overdue").length;
  const certsExpiring90 = dates.filter((d) => {
    if (d.category !== "Certification") return false;
    const diff = daysDiff(d.date);
    return diff !== null && diff >= 0 && diff <= 90;
  }).length;

  // Calendar grid helpers
  const calYear = calCursor.getFullYear();
  const calMonth = calCursor.getMonth();
  const monthLabel = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Mon=0 .. Sun=6
  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const evts = dates.filter((d) => String(d.date || "").slice(0, 10) === iso);
      cells.push({ day, iso, evts });
    }
    return cells;
  }, [calYear, calMonth, firstWeekday, daysInMonth, dates]);

  const sortedDates = useMemo(
    () => [...dates].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    [dates]
  );

  // Import spreadsheet (.xlsx / .csv)
  const handleSpreadsheetImport = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const imported = rows
        .map((r, idx) => {
          const norm = Object.fromEntries(
            Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase(), String(v).trim()])
          );
          const document_name = norm["document name"] || norm["document"] || norm["name"] || "";
          if (!document_name) return null;
          return {
            id: `imp-${Date.now()}-${idx}`,
            document_name,
            pic: norm["pic"] || norm["owner"] || "QA/QC Team",
            remarks: norm["remarks"] || norm["notes"] || "",
            due_date: norm["due date"] || norm["due_date"] || "",
            status: norm["status"] || "In progress",
          };
        })
        .filter(Boolean);

      if (!imported.length) {
        toast.error("No valid rows found. Columns expected: document name, PIC, remarks, due date.");
        return;
      }
      persistDocs([...imported, ...docs]);
      toast.success(`Imported ${imported.length} document(s).`);
    } catch (err) {
      toast.error(err?.message || "Failed to import spreadsheet.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Cooked yesterday / Quality Control data
  const yesterdayIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const cookedGroups = useMemo(() => {
    const yBatches = batches.filter((b) => String(b.production_date || "").slice(0, 10) === yesterdayIso);
    if (!yBatches.length) return [];
    const byProd = new Map();
    yBatches.forEach((b) => {
      const key = b.product_code || b.product_name || "PROD";
      if (!byProd.has(key)) {
        byProd.set(key, {
          code: String(b.product_code || key).slice(0, 3).toUpperCase(),
          product: b.product_name || b.product_code,
          batch: b.batch_number,
          batchesCount: 0,
          menus: [
            { id: `${key}-1`, name: `${b.product_name || key} sensory check`, prep: "About 20 min" },
          ],
        });
      }
      byProd.get(key).batchesCount += 1;
    });
    return Array.from(byProd.values());
  }, [batches, yesterdayIso]);

  const selectedMenuList = Object.entries(selectedMenus).filter(([, checked]) => checked);
  const needLocationCount = samples.filter((s) => !String(s.location || "").trim()).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">QA &amp; HACCP Safety</h2>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "certifications" && canEditQa && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleSpreadsheetImport(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#111827] border-[#293548] text-slate-200 hover:bg-[#1e293b]"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Import spreadsheet
              </Button>
              <Button
                size="sm"
                onClick={() => setDateModalOpen(true)}
                className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
              >
                Add important date
              </Button>
            </>
          )}
          {tab === "control" && canEditQa && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSampleModalOpen(true)}
              className="bg-[#111827] border-[#293548] text-slate-200 hover:bg-[#1e293b]"
            >
              Register sample
            </Button>
          )}
          {canRaiseCapa && <RaiseCapaButton />}
        </div>
      </div>

      {/* Two Tabs */}
      <div className="flex items-center gap-6 border-b border-[#1e293b]">
        <button
          type="button"
          onClick={() => setTab("certifications")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "certifications" ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          QA / Certifications
        </button>
        <button
          type="button"
          onClick={() => setTab("control")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "control" ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Quality Control
        </button>
      </div>

      {/* TAB 1: QA / Certifications */}
      {tab === "certifications" && (
        <div className="space-y-4">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4">
              <p className="text-xs text-slate-400">HACCP documents done</p>
              <p className="text-xl font-semibold text-cyan-400 mt-1">{doneDocsCount} of {docs.length}</p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4">
              <p className="text-xs text-slate-400">Dates due in 7 days</p>
              <p className="text-xl font-semibold text-amber-400 mt-1">{dueIn7Days}</p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4">
              <p className="text-xs text-slate-400">Overdue</p>
              <p className="text-xl font-semibold text-rose-400 mt-1">{overdueDatesCount}</p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4">
              <p className="text-xs text-slate-400">Certifications expiring in 90 days</p>
              <p className="text-xl font-semibold text-white mt-1">{certsExpiring90}</p>
            </div>
          </div>

          {/* Calendar + Upcoming dates */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4">
            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCalCursor(new Date(calYear, calMonth - 1, 1))}
                    className="p-1 rounded hover:bg-[#1e293b] text-slate-400"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-white">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => setCalCursor(new Date(calYear, calMonth + 1, 1))}
                    className="p-1 rounded hover:bg-[#1e293b] text-slate-400"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {["month", "week", "agenda"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCalMode(m)}
                      className={`capitalize ${calMode === m ? "text-cyan-300 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {calMode === "agenda" ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedDates.map((d) => {
                    const cat = DATE_CATEGORIES.find((c) => c.key === d.category) || DATE_CATEGORIES[2];
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg bg-[#0b1120] border border-[#1e293b] px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
                          <span className="text-slate-200 font-medium">{d.title}</span>
                          <span className="text-slate-500">· {d.category}</span>
                        </div>
                        <span className="text-slate-400">{fmtShortDate(d.date)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-400 text-center">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell, idx) =>
                      !cell ? (
                        <div key={`empty-${idx}`} className="h-12 rounded-md bg-[#0b1120]/40" />
                      ) : (
                        <div key={cell.iso} className="h-12 rounded-md bg-[#0b1120] border border-[#1e293b]/70 p-1 flex flex-col justify-between">
                          <span className="text-[11px] text-slate-300">{cell.day}</span>
                          <div className="space-y-0.5">
                            {cell.evts.slice(0, 2).map((ev) => {
                              const cat = DATE_CATEGORIES.find((c) => c.key === ev.category) || DATE_CATEGORIES[2];
                              return <div key={ev.id} title={`${ev.title} (${ev.category})`} className={`h-1.5 rounded-full ${cat.bar}`} />;
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-400">
                {DATE_CATEGORIES.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Upcoming dates</h3>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {sortedDates.map((item) => {
                  const diff = daysDiff(item.date);
                  const badge =
                    diff === null ? "" : diff < 0 ? "Overdue" : diff === 0 ? "Today" : `${diff} days`;
                  const badgeClass =
                    diff !== null && diff < 0
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : diff !== null && diff <= 7
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-slate-700/40 text-slate-300 border-slate-600/40";
                  return (
                    <div key={item.id} className="space-y-0.5 border-b border-[#1e293b]/70 pb-2.5 last:border-none">
                      <p className="text-xs font-medium text-slate-100">
                        {item.title} <span className="text-slate-400 font-normal">· {item.category.toLowerCase()}</span>
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{fmtShortDate(item.date)}</span>
                        {badge && <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badgeClass}`}>{badge}</span>}
                      </div>
                    </div>
                  );
                })}
                {sortedDates.length === 0 && <p className="text-xs text-slate-500">No upcoming dates recorded.</p>}
              </div>
            </div>
          </div>

          {/* Progress of HACCP documentation */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Progress of HACCP documentation</h3>
              <span className="text-xs text-slate-400">{doneDocsCount} of {docs.length} documents done · {pctDone}%</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0b1120]/60 text-slate-400 border-b border-[#1e293b]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Document name</th>
                    <th className="text-left px-4 py-2.5 font-medium">PIC</th>
                    <th className="text-left px-4 py-2.5 font-medium">Remarks</th>
                    <th className="text-left px-4 py-2.5 font-medium">Due date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No HACCP documents yet. Click &ldquo;+ Add document&rdquo; or &ldquo;Import spreadsheet&rdquo;.
                      </td>
                    </tr>
                  )}
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#1e293b]/30">
                      <td className="px-4 py-2.5 text-slate-100 font-medium">{doc.document_name}</td>
                      <td className="px-4 py-2.5 text-slate-300">{doc.pic || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-400">{doc.remarks || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-300">{fmtShortDate(doc.due_date)}</td>
                      <td className="px-4 py-2.5">
                        {canEditQa ? (
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = DOC_STATUSES[(DOC_STATUSES.indexOf(doc.status) + 1) % DOC_STATUSES.length];
                              persistDocs(docs.map((d) => (d.id === doc.id ? { ...d, status: nextStatus } : d)));
                            }}
                            title="Click to cycle status"
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[doc.status] || STATUS_PILL["In progress"]}`}
                          >
                            {doc.status}
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[doc.status] || STATUS_PILL["In progress"]}`}>
                            {doc.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-2 text-xs">
              {canEditQa ? (
                <button
                  type="button"
                  onClick={() => setDocModalOpen(true)}
                  className="text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add document
                </button>
              ) : <span />}
              <span className="text-slate-500">Import accepts .xlsx or .csv with columns: document name, PIC, remarks, due date</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Quality Control */}
      {tab === "control" && (
        <div className="space-y-4">
          {/* Cooked yesterday */}
          <div className="rounded-xl bg-[#0d1c2e] border border-cyan-500/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-cyan-300">
                Cooked yesterday · {fmtLongDate(yesterdayIso)}
              </p>
              <span className="text-xs text-slate-400">
                {cookedGroups.reduce((s, g) => s + g.batchesCount, 0)} batches · {cookedGroups.length} products
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cookedGroups.length === 0 && (
                <p className="text-xs text-slate-400 md:col-span-3">No batches recorded for yesterday.</p>
              )}
              {cookedGroups.map((g) => (
                <div key={g.code} className="rounded-lg bg-[#111827] border border-[#1e293b] p-3">
                  <p className="text-xs font-semibold text-white">{g.product}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{g.code} · {g.batchesCount} batch{g.batchesCount === 1 ? "" : "es"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested menu to cook */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Suggested menu to cook</h3>
              <span className="text-xs text-slate-400">Dishes made with yesterday&apos;s products · for sensory testing</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cookedGroups.map((g) => {
                const extraMenus = qcState.customMenus?.[g.code] || [];
                const allMenus = [...g.menus, ...extraMenus];
                return (
                  <div key={g.code} className="space-y-2.5">
                    <div>
                      <p className="text-xs font-semibold text-cyan-300">{g.product}</p>
                      <p className="text-[11px] text-slate-400">Batch {g.batch}</p>
                    </div>
                    <div className="space-y-2">
                      {allMenus.map((m) => (
                        <label key={m.id} className="flex items-start gap-2.5 cursor-pointer">
                          <Checkbox
                            checked={!!selectedMenus[m.id]}
                            onCheckedChange={(c) => setSelectedMenus((prev) => ({ ...prev, [m.id]: c === true }))}
                            className="mt-0.5 border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                          />
                          <div>
                            <p className="text-xs font-medium text-slate-100">{m.name}</p>
                            <p className="text-[11px] text-slate-400">{m.prep}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-2 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {selectedMenuList.length} menu{selectedMenuList.length === 1 ? "" : "s"} selected · a sensory sheet is created for each one
              </span>
              {canEditQa && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCustomMenuForm({ productCode: cookedGroups[0]?.code || "", name: "", prep: "About 20 min" });
                      setMenuModalOpen(true);
                    }}
                    className="bg-[#0b1120] border-[#293548] text-slate-200 hover:bg-[#1e293b]"
                  >
                    Add your own menu
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedMenuList.length) {
                        toast.error("Select at least one menu first.");
                        return;
                      }
                      const created = selectedMenuList.map(([id]) => ({ id, created_at: new Date().toISOString() }));
                      persistQc({ ...qcState, sensorySheets: [...created, ...(qcState.sensorySheets || [])] });
                      setSelectedMenus({});
                      toast.success(`Created ${created.length} sensory sheet(s).`);
                    }}
                    className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
                  >
                    Create sensory sheets
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Reminders and reports */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Reminders and reports</h3>
              <span className="text-xs text-slate-400">Sent automatically</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400">Fat globule test, then report</p>
                {cookedGroups.length === 0 ? (
                  <p className="text-xs text-slate-500">No batches from yesterday requiring fat globule testing.</p>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-[#0b1120] border border-[#1e293b] px-3 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-slate-100">{cookedGroups[0].product} · {cookedGroups[0].batchesCount} batch(es)</p>
                      <p className="text-[11px] text-slate-400">Reminder sent 8:00</p>
                    </div>
                    <button
                      type="button"
                      disabled={!canEditQa}
                      onClick={() => {
                        const next = qcState.fatGlobuleStatus === "Done" ? "Report pending" : "Done";
                        persistQc({ ...qcState, fatGlobuleStatus: next });
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[qcState.fatGlobuleStatus] || STATUS_PILL["Report pending"]}`}
                    >
                      {qcState.fatGlobuleStatus}
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400">Cooking report, one per batch</p>
                <div className="space-y-2">
                  {cookedGroups.length === 0 && <p className="text-xs text-slate-500">No cooking reports due.</p>}
                  {cookedGroups.map((g) => {
                    const submitted = qcState.cookingReports?.[g.code] ?? 0;
                    const done = submitted >= g.batchesCount;
                    return (
                      <div key={g.code} className="flex items-center justify-between rounded-lg bg-[#0b1120] border border-[#1e293b] px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-slate-100">{g.product} ({g.code})</p>
                          <p className="text-[11px] text-slate-400">{submitted} of {g.batchesCount} submitted</p>
                        </div>
                        <button
                          type="button"
                          disabled={!canEditQa}
                          onClick={() => {
                            const nextCount = done ? 0 : g.batchesCount;
                            persistQc({
                              ...qcState,
                              cookingReports: { ...(qcState.cookingReports || {}), [g.code]: nextCount },
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${done ? STATUS_PILL.Done : STATUS_PILL.Overdue}`}
                        >
                          {done ? "Done" : "Overdue"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Retention sample storage */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Retention sample storage</h3>
              <span className="text-xs text-slate-400">
                {samples.length} samples · {needLocationCount} need a location
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0b1120]/60 text-slate-400 border-b border-[#1e293b]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Sample ID</th>
                    <th className="text-left px-4 py-2.5 font-medium">Product</th>
                    <th className="text-left px-4 py-2.5 font-medium">Batch no.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Location</th>
                    <th className="text-left px-4 py-2.5 font-medium">Keep until</th>
                    <th className="text-left px-4 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {samples.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No retention samples registered yet.
                      </td>
                    </tr>
                  )}
                  {samples.map((s) => (
                    <tr key={s.id} className="hover:bg-[#1e293b]/30">
                      <td className="px-4 py-2.5 font-mono text-slate-200">{s.sample_id}</td>
                      <td className="px-4 py-2.5 text-slate-100">{s.product}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-300">{s.batch_number || "—"}</td>
                      <td className="px-4 py-2.5">
                        {s.location ? (
                          <span className="text-slate-300">{s.location}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px]">
                            Location not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{fmtLongDate(s.keep_until)}</td>
                      <td className="px-4 py-2.5">
                        {canEditQa && (
                          <button
                            type="button"
                            onClick={() => {
                              setLocationTarget(s);
                              setLocationInput(s.location || "");
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                              s.location
                                ? "bg-[#1e293b] text-slate-200 hover:bg-[#334155]"
                                : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 hover:bg-cyan-500/30"
                            }`}
                          >
                            {s.location ? "Move" : "Set location"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Important Date */}
      <Dialog open={dateModalOpen} onOpenChange={setDateModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add important date</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Title *</label>
              <Input
                value={newDate.title}
                onChange={(e) => setNewDate({ ...newDate, title: e.target.value })}
                placeholder="e.g. Internal GMP audit"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Category</label>
              <Select value={newDate.category} onValueChange={(v) => setNewDate({ ...newDate, category: v })}>
                <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Date *</label>
              <Input
                type="date"
                value={newDate.date}
                onChange={(e) => setNewDate({ ...newDate, date: e.target.value })}
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDateModalOpen(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={() => {
                if (!newDate.title.trim() || !newDate.date) return toast.error("Title and date are required.");
                persistDates([...dates, { ...newDate, id: `dt-${Date.now()}` }]);
                setNewDate({ title: "", category: "Document due", date: "" });
                setDateModalOpen(false);
                toast.success("Important date added.");
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add HACCP Document */}
      <Dialog open={docModalOpen} onOpenChange={setDocModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add HACCP document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Document name *</label>
              <Input value={newDoc.document_name} onChange={(e) => setNewDoc({ ...newDoc, document_name: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">PIC</label>
              <Input value={newDoc.pic} onChange={(e) => setNewDoc({ ...newDoc, pic: e.target.value })} placeholder="Person in charge" className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Remarks</label>
              <Input value={newDoc.remarks} onChange={(e) => setNewDoc({ ...newDoc, remarks: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Due date</label>
                <Input type="date" value={newDoc.due_date} onChange={(e) => setNewDoc({ ...newDoc, due_date: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Status</label>
                <Select value={newDoc.status} onValueChange={(v) => setNewDoc({ ...newDoc, status: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDocModalOpen(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={() => {
                if (!newDoc.document_name.trim()) return toast.error("Document name is required.");
                persistDocs([{ ...newDoc, id: `doc-${Date.now()}` }, ...docs]);
                setNewDoc({ document_name: "", pic: "", remarks: "", due_date: "", status: "In progress" });
                setDocModalOpen(false);
                toast.success("Document added.");
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
            >
              Add document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Register Retention Sample */}
      <Dialog open={sampleModalOpen} onOpenChange={setSampleModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Register sample</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Sample ID *</label>
                <Input value={newSample.sample_id} onChange={(e) => setNewSample({ ...newSample, sample_id: e.target.value.toUpperCase() })} placeholder="e.g. DSJ-291026-02" className="bg-[#0b1120] border-[#293548] text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Batch no.</label>
                <Input value={newSample.batch_number} onChange={(e) => setNewSample({ ...newSample, batch_number: e.target.value.toUpperCase() })} placeholder="e.g. DSJ-291026" className="bg-[#0b1120] border-[#293548] text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Product *</label>
              <Input value={newSample.product} onChange={(e) => setNewSample({ ...newSample, product: e.target.value })} placeholder="Product name" className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Storage location (optional)</label>
              <Input value={newSample.location} onChange={(e) => setNewSample({ ...newSample, location: e.target.value })} placeholder="e.g. Room A · Rack 1 · Shelf 1" className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Keep until</label>
              <Input type="date" value={newSample.keep_until} onChange={(e) => setNewSample({ ...newSample, keep_until: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSampleModalOpen(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={() => {
                if (!newSample.sample_id.trim() || !newSample.product.trim()) return toast.error("Sample ID and Product are required.");
                persistSamples([{ ...newSample, id: `smp-${Date.now()}` }, ...samples]);
                setNewSample({ sample_id: "", product: "", batch_number: "", cooked_date: "", location: "", keep_until: "" });
                setSampleModalOpen(false);
                toast.success("Retention sample registered.");
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
            >
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Set / Move Sample Location */}
      <Dialog open={!!locationTarget} onOpenChange={(o) => !o && setLocationTarget(null)}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">{locationTarget?.location ? "Move sample" : "Set sample location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-slate-400">{locationTarget?.sample_id} · {locationTarget?.product}</p>
            <Input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="e.g. Room A · Rack 1 · Shelf 1"
              className="bg-[#0b1120] border-[#293548] text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLocationTarget(null)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={() => {
                if (!locationInput.trim()) return toast.error("Enter a location.");
                persistSamples(samples.map((s) => (s.id === locationTarget.id ? { ...s, location: locationInput.trim() } : s)));
                setLocationTarget(null);
                toast.success("Sample location updated.");
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
            >
              Save location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add Your Own Menu */}
      <Dialog open={menuModalOpen} onOpenChange={setMenuModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Add your own menu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Product</label>
              <Select value={customMenuForm.productCode} onValueChange={(v) => setCustomMenuForm({ ...customMenuForm, productCode: v })}>
                <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{cookedGroups.map((g) => <SelectItem key={g.code} value={g.code}>{g.product}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Menu dish *</label>
              <Input value={customMenuForm.name} onChange={(e) => setCustomMenuForm({ ...customMenuForm, name: e.target.value })} placeholder="e.g. Grilled BBQ skewers" className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Prep time</label>
              <Input value={customMenuForm.prep} onChange={(e) => setCustomMenuForm({ ...customMenuForm, prep: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMenuModalOpen(false)} className="text-slate-400">Cancel</Button>
            <Button
              onClick={() => {
                if (!customMenuForm.name.trim()) return toast.error("Menu name is required.");
                const code = customMenuForm.productCode;
                const existing = qcState.customMenus?.[code] || [];
                persistQc({
                  ...qcState,
                  customMenus: {
                    ...(qcState.customMenus || {}),
                    [code]: [...existing, { id: `cm-${Date.now()}`, name: customMenuForm.name.trim(), prep: customMenuForm.prep }],
                  },
                });
                setMenuModalOpen(false);
                toast.success("Menu added.");
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300"
            >
              Add menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
