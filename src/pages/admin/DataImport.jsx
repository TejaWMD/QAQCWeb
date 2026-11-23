import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CsvImportPanel from "@/components/import/CsvImportPanel";
import { IMPORT_ENTITY_CONFIGS } from "@/lib/importEntityConfigs";

export default function DataImport() {
  const [destination, setDestination] = useState(IMPORT_ENTITY_CONFIGS[0]?.entity || "OperationLog");

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[#0F294A] text-lg font-semibold">Import CSV Data</h2>
          <p className="text-[#64748B] text-sm mt-1">
            Select a destination below to accurately route and save operational CSV records to the database.
          </p>
        </div>
        <div className="w-full sm:w-64 space-y-1">
          <label className="text-xs font-semibold text-[#0F294A]">Destination Table</label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger className="bg-white border-[#E2E8F0] text-[#0F294A]">
              <SelectValue placeholder="Select destination..." />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_ENTITY_CONFIGS.map((c) => (
                <SelectItem key={c.entity} value={c.entity}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={destination} onValueChange={setDestination}>
        <TabsList className="bg-white border border-[#E2E8F0] flex-wrap h-auto">
          {IMPORT_ENTITY_CONFIGS.map((c) => (
            <TabsTrigger
              key={c.entity}
              value={c.entity}
              className="data-[state=active]:bg-[#0F294A] data-[state=active]:text-white text-[#64748B]"
            >
              {c.tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
        {IMPORT_ENTITY_CONFIGS.map((c) => (
          <TabsContent key={c.entity} value={c.entity} className="mt-3">
            <CsvImportPanel config={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
