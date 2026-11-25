import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, FileText, Loader2, Upload } from "lucide-react";
import ImportMappingStep from "@/components/productmaster/ImportMappingStep";
import ImportPreviewStep from "@/components/productmaster/ImportPreviewStep";
import ProductImportReport from "@/components/productmaster/ProductImportReport";
import {
  autoMapColumns, buildImportPreview, buildTable, importableEntries, mappingSignature, readSheet, runImport,
} from "@/lib/productImportFlow";
import { downloadBlankTemplate } from "@/lib/productMaster";
import { primaryButton, subtleButton, labelClass } from "@/components/planning/styles";

const STEPS = ["1 · Upload", "2 · Column mapping", "3 · Preview", "4 · Report"];

// Four-step import: read the file, map the columns, check the rows, then report.
export default function ProductImportWizard({ open, onClose, products = [], recipes = [], settings = {}, onSaved }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState({ columns: [], rows: [] });
  const [mapping, setMapping] = useState({});
  const [saveMapping, setSaveMapping] = useState(true);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setFileName("");
    setTable({ columns: [], rows: [] });
    setMapping({});
    setSaveMapping(true);
    setImporting(false);
    setReport(null);
  }, [open]);

  const signature = useMemo(() => mappingSignature(table.columns), [table.columns]);
  const preview = useMemo(
    () => buildImportPreview({ columns: table.columns, rows: table.rows, mapping, products, recipes }),
    [table, mapping, products, recipes]
  );

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = null;
    if (!file) return;
    setReading(true);
    try {
      const rows = await readSheet(file);
      const built = buildTable(rows);
      if (!built.rows.length || !built.columns.length) {
        toast({ title: "Could not read that file", description: "It needs a header row and at least one data row.", variant: "destructive" });
        return;
      }
      const saved = settings.mapping && settings.mapping_signature === mappingSignature(built.columns) ? settings.mapping : null;
      setFileName(file.name);
      setTable(built);
      setMapping(saved || autoMapColumns(built.columns));
      setStep(1);
    } catch (e) {
      toast({ title: "Could not read that file", description: e?.message || "Use a CSV or Excel file.", variant: "destructive" });
    } finally {
      setReading(false);
    }
  };

  const confirm = async () => {
    const entries = importableEntries(preview.entries);
    if (!entries.length) {
      toast({ title: "Nothing to import", description: "No row is ready yet.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const settingsForImport = saveMapping ? { ...settings, mapping, mapping_signature: signature } : settings;
      const result = await runImport({ user, fileName, entries, settings: settingsForImport, recipes });
      setReport({
        fileName,
        entries,
        created: result.record.created_count,
        updated: result.record.updated_count,
        errors: result.record.errors_count,
        warnings: result.record.warnings_count,
        recipes: result.recipesCreated,
      });
      setStep(3);
      onSaved?.();
    } catch (e) {
      toast({ title: "Import failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const importable = importableEntries(preview.entries).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !importing && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Import Product Master</DialogTitle>
          <p className="text-xs text-[#64748B]">CSV or Excel. Rows are matched on Item Code — nothing is ever deleted by an import.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            {STEPS.map((label, index) => (
              <span
                key={label}
                className={`text-[11px] px-2 py-1 rounded-full border ${
                  index === step ? "border-[#BFD7FF] bg-[#EBF3FF] text-[#1D4ED8]" : index < step ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-[#E2E8F0] text-[#64748B]"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#E2E8F0] bg-white px-4 py-10 cursor-pointer hover:border-[#BFD7FF]">
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={onFile} disabled={reading} />
              {reading ? <Loader2 className="w-6 h-6 text-[#1D4ED8] animate-spin" /> : <Upload className="w-6 h-6 text-[#1D4ED8]" />}
              <span className="text-sm text-[#0F294A]">{reading ? "Reading the file..." : "Choose the datasheet CSV or Excel file"}</span>
              <span className="text-xs text-[#64748B]">Blank rows and a title row above the header are skipped automatically.</span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#64748B]">Start from the template if you are building a new file.</p>
              <Button variant="outline" onClick={downloadBlankTemplate} className={subtleButton}>
                <Download className="w-4 h-4 mr-1.5" /> Download blank template
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <ImportMappingStep
            columns={table.columns}
            mapping={mapping}
            setMapping={setMapping}
            onReset={() => setMapping(autoMapColumns(table.columns))}
            saveMapping={saveMapping}
            setSaveMapping={setSaveMapping}
          />
        )}

        {step === 2 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <FileText className="w-3.5 h-3.5 text-[#1D4ED8]" /> {fileName} · {table.rows.length} data row(s)
            </div>
            <ImportPreviewStep preview={preview} />
            {importable === 0 && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600">
                <AlertTriangle className="w-4 h-4" /> Nothing can be imported yet — check the mapping and the rejected rows.
              </p>
            )}
          </>
        )}

        {step === 3 && <ProductImportReport report={report} />}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className={subtleButton} disabled={importing}>
            {step === 3 ? "Done" : "Cancel"}
          </Button>
          {step > 0 && step < 3 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className={subtleButton} disabled={importing}>Back</Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} className={primaryButton} disabled={Object.keys(mapping).length === 0}>
              Preview import
            </Button>
          )}
          {step === 2 && (
            <Button onClick={confirm} disabled={importing || importable === 0} className={primaryButton}>
              {importing && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {importing ? "Importing..." : `Confirm import (${importable})`}
            </Button>
          )}
        </DialogFooter>
        {step === 0 && <p className={labelClass}>Nothing is saved until you confirm on the preview step.</p>}
      </DialogContent>
    </Dialog>
  );
}