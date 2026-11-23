import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import Home from "@/pages/operations/Home";
import OperationLogs from "@/pages/operations/OperationLogs";
import OvertimeRecord from "@/pages/operations/OvertimeRecord";
import WastageLogs from "@/pages/operations/WastageLogs";
import BaselineCapacity from "@/pages/operations/BaselineCapacity";
import ShiftLogDraft from "@/pages/operations/ShiftLogDraft";
import CsvImportPanel from "@/components/import/CsvImportPanel";
import { IMPORT_ENTITY_CONFIGS } from "@/lib/importEntityConfigs";

const TABS = [
  { value: "overview", label: "Overview", Component: Home },
  { value: "operation_record", label: "Operation Record", Component: OperationLogs },
  { value: "overtime_record", label: "Overtime Record", Component: OvertimeRecord },
  { value: "wastage_records", label: "Wastage Record", Component: WastageLogs },
  { value: "baseline_capacity", label: "Baseline Capacity", Component: BaselineCapacity },
  { value: "log_entry", label: "Log Entry", Component: ShiftLogDraft },
];

const STORAGE_KEY = "production_line_logs_active_tab";

export default function ProductionLineLogs() {
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (TABS.some((t) => t.value === saved)) return saved;
    } catch { /* ignore unavailable storage */ }
    return "overview";
  });

  const [importOpen, setImportOpen] = useState(false);
  const [destination, setDestination] = useState(IMPORT_ENTITY_CONFIGS[0]?.entity || "OperationLog");

  const onTabChange = (value) => {
    setTab(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch { /* ignore unavailable storage */ }
  };

  const activeConfig = IMPORT_ENTITY_CONFIGS.find((c) => c.entity === destination) || IMPORT_ENTITY_CONFIGS[0];

  return (
    <div className="min-h-screen bg-[#F6F8FC] w-full">
      <Tabs value={tab} onValueChange={onTabChange} className="w-full">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 flex flex-wrap items-center justify-between gap-3">
          <TabsList className="bg-[#F1F5F9] border border-[#E2E8F0] h-auto p-1 flex gap-1 w-full sm:w-max max-w-full overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex-none rounded-full px-4 py-1.5 text-sm whitespace-nowrap text-[#64748B] hover:text-[#0F294A] data-[state=active]:bg-[#0F294A] data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="bg-white border-[#E2E8F0] text-[#0F294A] hover:bg-[#F1F5F9] font-medium"
          >
            <Upload className="w-4 h-4 mr-1.5" /> Import CSV Data
          </Button>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0 focus-visible:outline-none">
            <t.Component onSavedTab={onTabChange} />
          </TabsContent>
        ))}
      </Tabs>

      {/* Import CSV Data Modal with Destination Selector */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#0F294A]">Import CSV Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0F294A]">Select Destination *</label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A]">
                  <SelectValue placeholder="Choose operational destination..." />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_ENTITY_CONFIGS.map((c) => (
                    <SelectItem key={c.entity} value={c.entity}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#64748B]">
                Records will be routed and saved directly to <strong>{activeConfig?.label}</strong> in the operational database.
              </p>
            </div>

            {activeConfig && <CsvImportPanel key={activeConfig.entity} config={activeConfig} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
