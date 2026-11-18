import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Home from "@/pages/operations/Home";
import OperationLogs from "@/pages/operations/OperationLogs";
import OvertimeRecord from "@/pages/operations/OvertimeRecord";
import WastageLogs from "@/pages/operations/WastageLogs";
import BaselineCapacity from "@/pages/operations/BaselineCapacity";

// The former Packaging Ops pages, now one "Production Line Logs" hub. Each tab
// renders the original page component unchanged, so every form, table, chart
// and filter behaves exactly as it did on its own page.
const TABS = [
  { value: "overview", label: "Overview", Component: Home },
  { value: "operation_record", label: "Operation Record", Component: OperationLogs },
  { value: "overtime_record", label: "Overtime Record", Component: OvertimeRecord },
  { value: "wastage_records", label: "Wastage Record", Component: WastageLogs },
  { value: "baseline_capacity", label: "Baseline Capacity", Component: BaselineCapacity },
];

const STORAGE_KEY = "production_line_logs_active_tab";

export default function ProductionLineLogs() {
  const [tab, setTab] = useState(() => {
    // Remember the last tab the user opened.
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (TABS.some((t) => t.value === saved)) return saved;
    } catch { /* ignore unavailable storage */ }
    return "overview";
  });

  const onTabChange = (value) => {
    setTab(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch { /* ignore unavailable storage */ }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <Tabs value={tab} onValueChange={onTabChange} className="w-full">
        <div className="sticky top-0 z-20 bg-[#F6F8FC] backdrop-blur border-b border-[#E2E8F0] px-4 md:px-6 py-3">
          <TabsList className="bg-[#F1F5F9] border border-[#E2E8F0] h-auto p-1 flex gap-1 w-max max-w-full overflow-x-auto">
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
        </div>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0 focus-visible:outline-none">
            <t.Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}