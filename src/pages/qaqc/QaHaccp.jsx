import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { productService } from "@/services/productService";
import { useAuth } from "@/lib/AuthContext";
import { appRoleOf, canAccess } from "@/lib/permissions";
import RaiseCapaButton from "@/components/qaqc/RaiseCapaButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_HACCP_DOCS,
  DEFAULT_IMPORTANT_DATES,
  DEFAULT_RETENTION_SAMPLES,
  loadQaSection,
  saveQaSection,
} from "@/lib/qaHaccpStore";

const DATE_CATEGORIES = [
  { key: "Audit or drill", dot: "bg-cyan-400", bar: "bg-cyan-400/85", label: "Audit or drill" },
  { key: "Certification", dot: "bg-violet-400", bar: "bg-violet-400/85", label: "Certification" },
  { key: "Document due", dot: "bg-amber-400", bar: "bg-amber-400/85", label: "Document due" },
  { key: "Visit or training", dot: "bg-emerald-400", bar: "bg-emerald-400/85", label: "Visit or training" },
];

const DOC_STATUSES = ["In progress", "Due soon", "Overdue", "Done"];

const STATUS_PILL = {
  "In progress": "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  "Due soon": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  Overdue: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  Done: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
};

const EMPTY_SAMPLE = {
  product: "",
  batch_number: "",
  number_of_sample: "",
  ph: "",
  brix: "",
  keep_until: "",
  remarks: "",
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

const fmtWeekdayDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
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
  // QA/QC team & admins (and non-manager staff assigned QA & HACCP) can edit & raise CAPA;
  // MD / Manager views read-only.
  const canEditQa =
    role === "admin" ||
    role === "qa_officer" ||
    (role !== "manager" && role !== "sales" && canAccess(user, "qa_haccp"));
  const canRaiseCapa = canEditQa;

  const [tab, setTab] = useState("certifications");
  const [docs, setDocs] = useState([]);
  const [dates, setDates] = useState([]);
  const [samples, setSamples] = useState([]);
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [calMode, setCalMode] = useState("month");
  const [calCursor, setCalCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Modals (Add / Edit Important Date)
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [editingDateId, setEditingDateId] = useState(null);
  const [newDate, setNewDate] = useState({ title: "", category: "Document due", date: "" });

  // Modals (Add / Edit HACCP Document)
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);
  const [newDoc, setNewDoc] = useState({ document_name: "", pic: "", remarks: "", due_date: "", status: "In progress" });

  // Modals (Add / Edit Retention Sample)
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [editingSampleId, setEditingSampleId] = useState(null);
  const [newSample, setNewSample] = useState(EMPTY_SAMPLE);

  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      loadQaSection("docs", DEFAULT_HACCP_DOCS),
      loadQaSection("dates", DEFAULT_IMPORTANT_DATES),
      loadQaSection("samples", DEFAULT_RETENTION_SAMPLES),
      base44.entities.BatchRecord.list("-created_date", 100).catch(() => []),
      productService.getActiveProducts().catch(() => []),
    ]).then(([d, dt, smp, br, prodRows]) => {
      setDocs(Array.isArray(d) ? d : DEFAULT_HACCP_DOCS);
      setDates(Array.isArray(dt) ? dt : DEFAULT_IMPORTANT_DATES);
      setSamples(Array.isArray(smp) ? smp : DEFAULT_RETENTION_SAMPLES);
      setBatches(Array.isArray(br) ? br : []);
      setProducts(Array.isArray(prodRows) ? prodRows.filter((p) => p.active !== false && !p.hidden) : []);
      setLoading(false);
    });
  }, []);

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.product_name)
        .map((p) => ({
          value: p.product_name,
          label: p.product_name,
          sublabel: [p.product_code, p.brand].filter(Boolean).join(" · ") || undefined,
        })),
    [products]
  );

  const persistDocs = async (next) => {
    setDocs(next);
    try {
      await saveQaSection("docs", next);
    } catch (err) {
      toast.error(err?.message || "Failed to sync HACCP documents to database.");
    }
  };
  const persistDates = async (next) => {
    setDates(next);
    try {
      await saveQaSection("dates", next);
    } catch (err) {
      toast.error(err?.message || "Failed to sync important dates to database.");
    }
  };
  const persistSamples = async (next) => {
    setSamples(next);
    try {
      await saveQaSection("samples", next);
    } catch (err) {
      toast.error(err?.message || "Failed to sync retention samples to database.");
    }
  };

  // KPI metrics
  const doneDocsCount = docs.filter((d) => d.status === "Done").length;
  const pctDone = docs.length ? Math.round((doneDocsCount / docs.length) * 100) : 0;
  const dueIn7Days =
    dates.filter((d) => {
      const diff = daysDiff(d.date);
      return diff !== null && diff >= 0 && diff <= 7;
    }).length +
    docs.filter((d) => d.status === "Due soon").length;
  const overdueDatesCount =
    dates.filter((d) => {
      const diff = daysDiff(d.date);
      return diff !== null && diff < 0;
    }).length +
    docs.filter((d) => d.status === "Overdue").length;
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

  const weekCells = useMemo(() => {
    const start = new Date(calCursor);
    const dow = (start.getDay() + 6) % 7; // Mon=0 .. Sun=6
    start.setDate(start.getDate() - dow);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const evts = dates.filter((ev) => String(ev.date || "").slice(0, 10) === iso);
      out.push({ day: d.getDate(), iso, evts });
    }
    return out;
  }, [calCursor, dates]);

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
          const rawDue = norm["due date"] || norm["due_date"] || "";
          let isoDue = "";
          if (/^\d{4}-\d{2}-\d{2}/.test(rawDue)) {
            isoDue = rawDue.slice(0, 10);
          } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(rawDue)) {
            const [dPart, mPart, yPart] = rawDue.split(/[/-]/);
            isoDue = `${yPart}-${mPart.padStart(2, "0")}-${dPart.padStart(2, "0")}`;
          } else if (rawDue) {
            const parsed = new Date(rawDue);
            if (!Number.isNaN(parsed.getTime())) isoDue = parsed.toISOString().slice(0, 10);
          }
          const matchedStatus = DOC_STATUSES.find(
            (st) => st.toLowerCase() === String(norm["status"] || "").toLowerCase()
          );
          return {
            id: `imp-${Date.now()}-${idx}`,
            document_name,
            pic: norm["pic"] || norm["owner"] || "QA/QC Team",
            remarks: norm["remarks"] || norm["notes"] || "",
            due_date: isoDue || rawDue,
            status: matchedStatus || "In progress",
          };
        })
        .filter(Boolean);

      if (!imported.length) {
        toast.error("No valid rows found. Columns expected: document name, PIC, remarks, due date.");
        return;
      }
      await persistDocs([...imported, ...docs]);
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
    let yBatches = batches.filter((b) => String(b.production_date || "").slice(0, 10) === yesterdayIso);
    if (!yBatches.length && batches.length > 0) {
      const latestDate = String(batches[0]?.production_date || "").slice(0, 10);
      if (latestDate) {
        yBatches = batches.filter((b) => String(b.production_date || "").slice(0, 10) === latestDate);
      }
    }
    if (!yBatches.length) return [];
    const byProd = new Map();
    yBatches.forEach((b) => {
      const key = b.product_code || b.product_name || "PROD";
      if (!byProd.has(key)) {
        const prefix = String(b.batch_number || key).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "BCH";
        const pName = b.product_name || b.product_code || key;
        byProd.set(key, {
          code: prefix,
          product: pName,
          batch: b.batch_number,
          batchesCount: 0,
        });
      }
      byProd.get(key).batchesCount += 1;
    });
    return Array.from(byProd.values());
  }, [batches, yesterdayIso]);

  const cookedDisplayDate = useMemo(() => {
    const yBatches = batches.filter((b) => String(b.production_date || "").slice(0, 10) === yesterdayIso);
    if (yBatches.length > 0) return yesterdayIso;
    const latest = String(batches[0]?.production_date || "").slice(0, 10);
    return latest || yesterdayIso;
  }, [batches, yesterdayIso]);

  const openAddDate = (presetIso = "") => {
    setEditingDateId(null);
    setNewDate({ title: "", category: "Document due", date: presetIso || "" });
    setDateModalOpen(true);
  };

  const openEditDate = (item) => {
    setEditingDateId(item.id);
    setNewDate({ title: item.title || "", category: item.category || "Document due", date: String(item.date || "").slice(0, 10) });
    setDateModalOpen(true);
  };

  const deleteDate = (id) => {
    persistDates(dates.filter((d) => d.id !== id));
    toast.success("Important date removed.");
  };

  const openAddDoc = () => {
    setEditingDocId(null);
    setNewDoc({ document_name: "", pic: "", remarks: "", due_date: "", status: "In progress" });
    setDocModalOpen(true);
  };

  const openEditDoc = (doc) => {
    setEditingDocId(doc.id);
    setNewDoc({
      document_name: doc.document_name || "",
      pic: doc.pic || "",
      remarks: doc.remarks || "",
      due_date: String(doc.due_date || "").slice(0, 10),
      status: DOC_STATUSES.includes(doc.status) ? doc.status : "In progress",
    });
    setDocModalOpen(true);
  };

  const deleteDoc = (id) => {
    persistDocs(docs.filter((d) => d.id !== id));
    toast.success("Document deleted.");
  };

  const openAddSample = () => {
    setEditingSampleId(null);
    setNewSample(EMPTY_SAMPLE);
    setSampleModalOpen(true);
  };

  const openEditSample = (s) => {
    setEditingSampleId(s.id);
    setNewSample({
      product: s.product || "",
      batch_number: s.batch_number || "",
      number_of_sample: s.number_of_sample ?? "",
      ph: s.ph ?? "",
      brix: s.brix ?? "",
      keep_until: String(s.keep_until || "").slice(0, 10),
      remarks: s.remarks || "",
    });
    setSampleModalOpen(true);
  };

  const deleteSample = (id) => {
    persistSamples(samples.filter((s) => s.id !== id));
    toast.success("Retention sample deleted.");
  };

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
                onClick={() => openAddDate("")}
                className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add important date
              </Button>
            </>
          )}
          {tab === "control" && canEditQa && (
            <Button
              size="sm"
              onClick={openAddSample}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add item
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
                    onClick={() =>
                      setCalCursor(
                        calMode === "week"
                          ? new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() - 7)
                          : new Date(calYear, calMonth - 1, 1)
                      )
                    }
                    className="p-1 rounded hover:bg-[#1e293b] text-slate-400"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-white">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setCalCursor(
                        calMode === "week"
                          ? new Date(calCursor.getFullYear(), calCursor.getMonth(), calCursor.getDate() + 7)
                          : new Date(calYear, calMonth + 1, 1)
                      )
                    }
                    className="p-1 rounded hover:bg-[#1e293b] text-slate-400"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {["month", "week", "agenda"].map((m, idx) => (
                    <React.Fragment key={m}>
                      {idx > 0 && <span className="text-slate-600">·</span>}
                      <button
                        type="button"
                        onClick={() => setCalMode(m)}
                        className={`capitalize ${calMode === m ? "text-cyan-300 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        {m}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {calMode === "agenda" ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedDates.length === 0 && (
                    <p className="text-xs text-slate-500 py-4 text-center">No scheduled events in agenda.</p>
                  )}
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
                    {(calMode === "week" ? weekCells : calendarCells).map((cell, idx) =>
                      !cell ? (
                        <div key={`empty-${idx}`} className="h-12 rounded-md bg-[#0b1120]/40" />
                      ) : (
                        <button
                          key={cell.iso}
                          type="button"
                          disabled={!canEditQa}
                          onClick={() => canEditQa && openAddDate(cell.iso)}
                          title={canEditQa ? `Add important date on ${fmtLongDate(cell.iso)}` : undefined}
                          className={`h-12 rounded-md bg-[#0b1120] border border-[#1e293b]/70 p-1.5 flex flex-col justify-between text-left ${
                            canEditQa ? "hover:border-cyan-400/60 hover:bg-[#132238] cursor-pointer transition-colors" : "cursor-default"
                          }`}
                        >
                          <span className="text-[11px] text-slate-300">{cell.day}</span>
                          <div className="space-y-0.5 w-full">
                            {cell.evts.slice(0, 2).map((ev) => {
                              const cat = DATE_CATEGORIES.find((c) => c.key === ev.category) || DATE_CATEGORIES[2];
                              return <div key={ev.id} title={`${ev.title} (${ev.category})`} className={`h-1.5 rounded-full ${cat.bar}`} />;
                            })}
                          </div>
                        </button>
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Upcoming dates</h3>
                {canEditQa && (
                  <button
                    type="button"
                    onClick={() => openAddDate("")}
                    className="text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add date
                  </button>
                )}
              </div>
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
                  const suffix =
                    item.category === "Document due" ? " · document" : item.category ? ` · ${item.category.toLowerCase()}` : "";
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-2 border-b border-[#1e293b]/70 pb-2.5 last:border-none">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-medium text-slate-100 truncate">
                          {item.title}
                          <span className="text-slate-400 font-normal">{suffix}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{fmtShortDate(item.date)}</span>
                          {badge && <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badgeClass}`}>{badge}</span>}
                        </div>
                      </div>
                      {canEditQa && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditDate(item)}
                            className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1e293b]"
                            title="Edit date"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDate(item.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1e293b]"
                            title="Delete date"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {sortedDates.length === 0 && <p className="text-xs text-slate-500">No upcoming dates recorded.</p>}
              </div>
            </div>
          </div>

          {/* Progress of HACCP documentation */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Progress of HACCP documentation</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{doneDocsCount} of {docs.length} documents done · {pctDone}%</span>
                  {canEditQa && (
                    <Button
                      size="sm"
                      onClick={openAddDoc}
                      className="h-7 px-2.5 text-xs bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add document
                    </Button>
                  )}
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pctDone}%` }} />
              </div>
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
                    {canEditQa && <th className="text-right px-4 py-2.5 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={canEditQa ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                        No HACCP documents yet. Click &ldquo;+ Add document&rdquo; or &ldquo;Import spreadsheet&rdquo;.
                      </td>
                    </tr>
                  )}
                  {docs.map((doc) => {
                    const currentStatus = DOC_STATUSES.includes(doc.status) ? doc.status : "In progress";
                    return (
                      <tr key={doc.id} className="hover:bg-[#1e293b]/30">
                        <td className="px-4 py-2.5 text-slate-100 font-medium">{doc.document_name}</td>
                        <td className="px-4 py-2.5 text-slate-200 font-medium">{doc.pic || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-400">{doc.remarks || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-200 font-medium">{fmtShortDate(doc.due_date)}</td>
                        <td className="px-4 py-2.5">
                          {canEditQa ? (
                            <Select
                              value={currentStatus}
                              onValueChange={(nextStatus) => {
                                persistDocs(docs.map((d) => (d.id === doc.id ? { ...d, status: nextStatus } : d)));
                                toast.success(`Status updated to "${nextStatus}".`);
                              }}
                            >
                              <SelectTrigger
                                className={`h-7 w-[130px] text-[11px] font-medium px-2.5 ${STATUS_PILL[currentStatus] || STATUS_PILL["In progress"]}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DOC_STATUSES.map((st) => (
                                  <SelectItem key={st} value={st}>{st}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_PILL[currentStatus] || STATUS_PILL["In progress"]}`}>
                              {currentStatus}
                            </span>
                          )}
                        </td>
                        {canEditQa && (
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditDoc(doc)}
                              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1e293b] mr-1"
                              title="Edit document"
                            >
                              <Pencil className="w-3.5 h-3.5 inline" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDoc(doc.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1e293b]"
                              title="Delete document"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-2 text-xs">
              {canEditQa ? (
                <button
                  type="button"
                  onClick={openAddDoc}
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
                Cooked yesterday · {fmtWeekdayDate(cookedDisplayDate)}
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

          {/* Retention sample storage */}
          <div className="rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Retention sample storage</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {samples.length} sample{samples.length === 1 ? "" : "s"}
                </span>
                {canEditQa && (
                  <Button
                    size="sm"
                    onClick={openAddSample}
                    className="h-7 px-2.5 text-xs bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add item
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0b1120]/60 text-slate-400 border-b border-[#1e293b]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Product</th>
                    <th className="text-left px-4 py-2.5 font-medium">Batch no.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Number of sample</th>
                    <th className="text-left px-4 py-2.5 font-medium">pH</th>
                    <th className="text-left px-4 py-2.5 font-medium">Brix</th>
                    <th className="text-left px-4 py-2.5 font-medium">Keep until</th>
                    <th className="text-left px-4 py-2.5 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {samples.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No retention samples registered yet.
                      </td>
                    </tr>
                  )}
                  {samples.map((s) => {
                    const batchDisplay = s.batch_number || String(s.sample_id || "").replace(/-\d+$/, "");
                    return (
                      <tr key={s.id} className="hover:bg-[#1e293b]/30">
                        <td className="px-4 py-2.5 text-slate-100 font-medium">{s.product || "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{batchDisplay || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-200">
                          {s.number_of_sample !== undefined && s.number_of_sample !== "" ? s.number_of_sample : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-200">
                          {s.ph !== undefined && s.ph !== "" ? s.ph : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-200">
                          {s.brix !== undefined && s.brix !== "" ? s.brix : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{fmtLongDate(s.keep_until)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-300">{s.remarks || "—"}</span>
                            {canEditQa && (
                              <div className="inline-flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openEditSample(s)}
                                  className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1e293b]"
                                  title="Edit item"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSample(s.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1e293b]"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Important Date */}
      <Dialog open={dateModalOpen} onOpenChange={setDateModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingDateId ? "Edit important date" : "Add important date"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Title *</label>
              <Input
                value={newDate.title}
                onChange={(e) => setNewDate({ ...newDate, title: e.target.value })}
                placeholder="e.g. Internal GMP audit"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Date *</label>
              <Input
                type="date"
                value={newDate.date}
                onChange={(e) => setNewDate({ ...newDate, date: e.target.value })}
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDateModalOpen(false)} className="border-[#293548] bg-transparent text-slate-300 hover:bg-[#1e293b] hover:text-white">Cancel</Button>
            <Button
              type="button"
              onClick={async () => {
                if (!newDate.title.trim() || !newDate.date) return toast.error("Title and date are required.");
                if (editingDateId) {
                  await persistDates(dates.map((d) => (d.id === editingDateId ? { ...d, ...newDate } : d)));
                  toast.success("Important date updated.");
                } else {
                  await persistDates([...dates, { ...newDate, id: `dt-${Date.now()}` }]);
                  toast.success("Important date added.");
                }
                setNewDate({ title: "", category: "Document due", date: "" });
                setEditingDateId(null);
                setDateModalOpen(false);
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 font-semibold"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add / Edit HACCP Document */}
      <Dialog open={docModalOpen} onOpenChange={setDocModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingDocId ? "Edit HACCP document" : "Add HACCP document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Document name *</label>
              <Input value={newDoc.document_name} onChange={(e) => setNewDoc({ ...newDoc, document_name: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">PIC</label>
              <Input value={newDoc.pic} onChange={(e) => setNewDoc({ ...newDoc, pic: e.target.value })} placeholder="Person in charge" className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Remarks</label>
              <Input value={newDoc.remarks} onChange={(e) => setNewDoc({ ...newDoc, remarks: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Due date</label>
                <Input type="date" value={newDoc.due_date} onChange={(e) => setNewDoc({ ...newDoc, due_date: e.target.value })} className="bg-[#0b1120] border-[#293548] text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Status</label>
                <Select value={newDoc.status} onValueChange={(v) => setNewDoc({ ...newDoc, status: v })}>
                  <SelectTrigger className="bg-[#0b1120] border-[#293548] text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDocModalOpen(false)} className="border-[#293548] bg-transparent text-slate-300 hover:bg-[#1e293b] hover:text-white">Cancel</Button>
            <Button
              type="button"
              onClick={async () => {
                if (!newDoc.document_name.trim()) return toast.error("Document name is required.");
                if (editingDocId) {
                  await persistDocs(docs.map((d) => (d.id === editingDocId ? { ...d, ...newDoc } : d)));
                  toast.success("Document updated.");
                } else {
                  await persistDocs([{ ...newDoc, id: `doc-${Date.now()}` }, ...docs]);
                  toast.success("Document added.");
                }
                setNewDoc({ document_name: "", pic: "", remarks: "", due_date: "", status: "In progress" });
                setEditingDocId(null);
                setDocModalOpen(false);
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 font-semibold"
            >
              {editingDocId ? "Save changes" : "Add document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add / Edit Retention Sample */}
      <Dialog open={sampleModalOpen} onOpenChange={setSampleModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1e293b] text-slate-100 sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingSampleId ? "Edit retention sample" : "Add retention sample"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Product (from Product Master) *</label>
              <SearchableSelect
                value={newSample.product}
                onValueChange={(v) => setNewSample({ ...newSample, product: v })}
                options={productOptions}
                placeholder="Select product from Product Master..."
                searchPlaceholder="Search product name or code..."
                allowCustom={productOptions.length === 0}
                clearable
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Batch no.</label>
                <Input
                  value={newSample.batch_number}
                  onChange={(e) => setNewSample({ ...newSample, batch_number: e.target.value.toUpperCase() })}
                  placeholder="e.g. DSJ291026A"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Number of sample</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={newSample.number_of_sample}
                  onChange={(e) => setNewSample({ ...newSample, number_of_sample: e.target.value })}
                  placeholder="e.g. 2"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">pH</label>
                <Input
                  type="number"
                  step="any"
                  value={newSample.ph}
                  onChange={(e) => setNewSample({ ...newSample, ph: e.target.value })}
                  placeholder="e.g. 4.2"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Brix</label>
                <Input
                  type="number"
                  step="any"
                  value={newSample.brix}
                  onChange={(e) => setNewSample({ ...newSample, brix: e.target.value })}
                  placeholder="e.g. 12.5"
                  className="bg-[#0b1120] border-[#293548] text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Keep until</label>
              <Input
                type="date"
                value={newSample.keep_until}
                onChange={(e) => setNewSample({ ...newSample, keep_until: e.target.value })}
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Remarks</label>
              <Input
                value={newSample.remarks}
                onChange={(e) => setNewSample({ ...newSample, remarks: e.target.value })}
                placeholder="Optional remarks"
                className="bg-[#0b1120] border-[#293548] text-white"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setSampleModalOpen(false)} className="border-[#293548] bg-transparent text-slate-300 hover:bg-[#1e293b] hover:text-white">Cancel</Button>
            <Button
              type="button"
              onClick={async () => {
                if (!newSample.product.trim()) return toast.error("Please choose a product.");
                const record = {
                  product: newSample.product.trim(),
                  batch_number: newSample.batch_number.trim().toUpperCase(),
                  number_of_sample: newSample.number_of_sample === "" ? "" : Number(newSample.number_of_sample),
                  ph: newSample.ph === "" ? "" : String(newSample.ph).trim(),
                  brix: newSample.brix === "" ? "" : String(newSample.brix).trim(),
                  keep_until: newSample.keep_until,
                  remarks: newSample.remarks.trim(),
                };
                if (editingSampleId) {
                  await persistSamples(samples.map((s) => (s.id === editingSampleId ? { ...s, ...record } : s)));
                  toast.success("Retention sample updated.");
                } else {
                  await persistSamples([{ ...record, id: `smp-${Date.now()}` }, ...samples]);
                  toast.success("Retention sample added.");
                }
                setNewSample(EMPTY_SAMPLE);
                setEditingSampleId(null);
                setSampleModalOpen(false);
              }}
              className="bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30 font-semibold"
            >
              {editingSampleId ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
