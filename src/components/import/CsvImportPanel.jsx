import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName } from "@/lib/permissions";
import { parseCsv, coerceValue } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import FieldMappingList from "@/components/import/FieldMappingList";
import { syncOvertimeFromOperationLogs } from "@/services/shiftLogService";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const CHUNK_SIZE = 100;
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const WASTE_COLS = [
  "bottle_waste", "jar_waste", "plastic_waste", "pouch_waste", "foil_waste",
  "cup_waste", "tub_waste", "cap_waste", "lid_waste", "packet_waste",
  "shrink_label_waste", "label_waste", "extra_sticker_waste", "carton_box_waste",
];

function combineDateTime(dateStr, timeVal, startTimeVal) {
  if (!timeVal) return undefined;
  const raw = String(timeVal).trim();
  if (!raw) return undefined;
  // Already ISO datetime
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !dateStr) return raw;
  const [y, mo, da] = String(dateStr).slice(0, 10).split("-").map(Number);
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] || 0);
  const d = new Date(y, mo - 1, da, h, min, sec, 0);
  if (Number.isNaN(d.getTime())) return undefined;
  if (startTimeVal) {
    const sm = String(startTimeVal).trim().match(/^(\d{1,2}):(\d{2})/);
    if (sm) {
      const sMin = Number(sm[1]) * 60 + Number(sm[2]);
      const eMin = h * 60 + min;
      if (eMin <= sMin) d.setDate(d.getDate() + 1);
    }
  }
  return d.toISOString();
}

function isSummaryOrTestRow(row, rec) {
  const firstCell = String(row[0] || "").trim().toUpperCase();
  if (firstCell === "TOTAL" || firstCell === "GRAND TOTAL" || firstCell === "SUMMARY") return true;
  const prod = String(rec.product_sku || rec.product_name || "").trim().toUpperCase();
  const batch = String(rec.batch_number || "").trim().toUpperCase();
  if (prod === "TEST PRODUCT" || prod === "TEST SAMPLE PRODUCT" || /^TEST\d*$/.test(batch)) return true;
  return false;
}

// Builds the import payload: only mapped fields with a value are sent, so
// entity defaults apply to the rest. Automatically skips TOTAL/test rows,
// normalizes OperationLog times & batch tags, and clamps negative wastage.
function buildRecords({ entity, fields, required, headers, rows, mapping }) {
  const labelOf = (key) => fields.find((f) => f.key === key)?.key || key;
  const records = [];
  const errors = [];
  let ignoredSummary = 0;

  rows.forEach((row, idx) => {
    const firstCell = String(row[0] || "").trim().toUpperCase();
    if (firstCell === "TOTAL" || firstCell === "GRAND TOTAL" || firstCell === "SUMMARY") {
      ignoredSummary++;
      return;
    }

    const rec = {};
    let rowError = null;
    for (const f of fields) {
      const col = mapping[f.key];
      if (!col) continue;
      const raw = row[headers.indexOf(col)];
      if (raw === undefined || raw === "") continue;
      const coerced = coerceValue(f, raw);
      if (coerced.skip) continue;
      if (coerced.error) { rowError = `${f.key}: ${coerced.error}`; break; }
      rec[f.key] = coerced.value;
    }
    if (rowError) { errors.push({ row: idx + 2, error: rowError }); return; }

    if (isSummaryOrTestRow(row, rec)) {
      ignoredSummary++;
      return;
    }

    if (entity === "OperationLog") {
      const rb = String(rec.record_batch || "").trim().toLowerCase();
      rec.record_batch = rb === "legacy" ? "legacy" : "current";
      if (!rec.product_name && rec.product_sku) rec.product_name = rec.product_sku;
      const rawStart = rec.ot_start;
      const rawEnd = rec.ot_end;
      if (rawStart) rec.ot_start = combineDateTime(rec.ot_date, rawStart);
      if (rawEnd) rec.ot_end = combineDateTime(rec.ot_date, rawEnd, rawStart);
      if (rec.hourly_ot_rate === undefined) rec.hourly_ot_rate = 12;
    }

    if (entity === "WastageLog") {
      let componentSum = 0;
      for (const col of WASTE_COLS) {
        if (rec[col] !== undefined) {
          rec[col] = Math.max(0, Number(rec[col]) || 0);
          componentSum += rec[col];
        }
      }
      if (rec.total_waste === undefined || Number(rec.total_waste) < componentSum) {
        rec.total_waste = componentSum;
      }
    }

    const missing = required.filter((k) => rec[k] === undefined || rec[k] === "");
    if (missing.length) { errors.push({ row: idx + 2, error: `Missing required field(s): ${missing.map(labelOf).join(", ")}` }); return; }
    records.push(rec);
  });
  return { records, errors, ignoredSummary };
}

function ResultBanner({ result, label }) {
  const ok = result.created > 0 && result.rowErrors.length === 0;
  const shown = result.rowErrors.slice(0, 15);
  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${ok ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-amber-700" />}
        <span className="text-[#0F294A] font-medium">
          {result.created} new record{result.created === 1 ? "" : "s"} added to {label}
          {result.duplicatesSkipped > 0 && `, ${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? "" : "s"} skipped`}
          {result.ignoredSummary > 0 && `, ${result.ignoredSummary} TOTAL/test row${result.ignoredSummary === 1 ? "" : "s"} ignored`}
          {result.rowErrors.length > 0 && `, ${result.rowErrors.length} error${result.rowErrors.length === 1 ? "" : "s"}`}
          .
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="text-xs text-[#64748B] space-y-1 max-h-40 overflow-y-auto">
          {shown.map((e, i) => (
            <li key={i}>Row {e.row ?? "?"}: {e.error}</li>
          ))}
          {result.rowErrors.length > shown.length && <li>… and {result.rowErrors.length - shown.length} more</li>}
        </ul>
      )}
    </div>
  );
}

// One-time historical CSV import with automatic deduplication against existing
// Supabase records so re-uploading the same file never creates duplicate rows.
export default function CsvImportPanel({ config }) {
  const { entity, label, fields, required, dedupKey } = config;
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result);
      if (!parsed.headers.length || !parsed.rows.length) {
        toast({ title: "Could not read that CSV", description: "Make sure the file has a header row and at least one data row.", variant: "destructive" });
        return;
      }
      const auto = {};
      const usedHeaders = new Set();
      fields.forEach((f) => {
        const candidates = [f.key, f.key.replace(/_/g, " "), ...(f.aliases || [])].map(norm);
        const hit = parsed.headers.find((h) => !usedHeaders.has(h) && candidates.includes(norm(h)));
        if (hit) usedHeaders.add(hit);
        auto[f.key] = hit || "";
      });
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(auto);
      setFileName(file.name);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    const { records, errors, ignoredSummary } = buildRecords({ entity, fields, required, headers, rows, mapping });
    if (!records.length) {
      setResult({ created: 0, duplicatesSkipped: 0, ignoredSummary, rowErrors: errors });
      return;
    }
    setImporting(true);
    setResult(null);

    // Fetch existing rows to prevent duplicate records in Supabase on re-import
    let toInsert = records;
    let duplicatesSkipped = 0;
    if (typeof dedupKey === "function") {
      try {
        const existing = await base44.entities[entity].list("-created_date", 2000);
        const existingKeys = new Set((Array.isArray(existing) ? existing : []).map(dedupKey));
        const seenInFile = new Set();
        toInsert = [];
        for (const rec of records) {
          const k = dedupKey(rec);
          if (existingKeys.has(k) || seenInFile.has(k)) {
            duplicatesSkipped++;
            continue;
          }
          seenInFile.add(k);
          toInsert.push(rec);
        }
      } catch {
        // Fallback if list fails: proceed with in-file dedup only
      }
    }

    if (!toInsert.length) {
      setImporting(false);
      setResult({ created: 0, duplicatesSkipped, ignoredSummary, rowErrors: errors });
      return;
    }

    setProgress({ done: 0, total: toInsert.length });
    let created = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      try {
        await base44.entities[entity].bulkCreate(chunk);
        created += chunk.length;
      } catch {
        // A few bad rows can fail a whole batch: retry them one by one so the
        // good rows still get in.
        for (const rec of chunk) {
          try {
            await base44.entities[entity].create(rec);
            created++;
          } catch (err) {
            rowErrors.push({ row: null, error: `${err?.message || String(err)} (${required[0]}: ${rec[required[0]]})` });
          }
        }
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, toInsert.length), total: toInsert.length });
    }
    if (entity === "OperationLog" && created > 0) {
      await syncOvertimeFromOperationLogs().catch(() => {});
    }
    setImporting(false);
    setResult({ created, duplicatesSkipped, ignoredSummary, rowErrors });
    try {
      const now = new Date();
      await base44.entities.AuditLog.create({
        event_time: now.toISOString(),
        event_stamp: now.toISOString().slice(0, 19).replace("T", " "),
        user_name: actingUserName(user) || "—",
        module: "CSV Data Import",
        action: "Imported",
        record_id: label,
        details: `Imported ${created} record(s) into ${label} from ${fileName}`,
        new_value: `${created} created`,
      });
    } catch {
      // The import itself already succeeded; the audit entry must not undo it.
    }
  };

  return (
    <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-4 space-y-4">
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={importing} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          variant="outline"
          className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9] hover:text-[#0F294A]"
        >
          <Upload className="w-4 h-4 mr-1.5" /> Choose CSV file
        </Button>
        {fileName && (
          <span className="inline-flex items-center gap-1.5 text-sm text-[#64748B]">
            <FileText className="w-4 h-4 text-[#1D4ED8] shrink-0" />
            {fileName} — {rows.length} data rows, {headers.length} columns
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <FieldMappingList
          fields={fields}
          headers={headers}
          mapping={mapping}
          required={required}
          onChange={setMapping}
          disabled={importing}
        />
      )}

      {rows.length > 0 && (
        <Button onClick={runImport} disabled={importing} className="bg-[#0F294A] hover:bg-[#193B68] text-white">
          {importing && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {importing ? `Importing… ${progress.done} / ${progress.total}` : `Add ${rows.length} rows to ${label}`}
        </Button>
      )}

      {result && <ResultBanner result={result} label={label} />}
    </div>
  );
}