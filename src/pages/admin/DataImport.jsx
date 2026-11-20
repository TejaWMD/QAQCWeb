import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package } from "lucide-react";
import CsvImportPanel from "@/components/import/CsvImportPanel";
import SheetMigration from "@/pages/admin/SheetMigration";
import { IMPORT_ENTITY_CONFIGS } from "@/lib/importEntityConfigs";
import { panelClass, subtleButton } from "@/components/planning/styles";

// One-Time Data Import Center (admin only):
// - Product Master has its own single source-of-truth import & edit wizard on /product-master.
// - Operation Record & Wastage Record support deduplicated one-time historical CSV import.
// - Excel / Sheet Migration handles Forecasts & Opening Stock (upserted safely).
export default function DataImport() {
  const [destination, setDestination] = useState(IMPORT_ENTITY_CONFIGS[0]?.entity || "OperationLog");

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-[#0F294A] text-lg font-semibold">One-Time Historical Data Import</h2>
        <p className="text-[#64748B] text-sm mt-1">
          Import past Operation and Wastage records once with automatic duplicate protection. For daily entries going forward, use Daily Line Entry.
        </p>
      </div>

      <div className={`${panelClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-start gap-2.5">
          <Package className="w-4 h-4 text-[#1D4ED8] mt-0.5 shrink-0" />
          <div>
            <p className="text-[#0F294A] text-sm font-semibold">Product Master (Single Source of Truth)</p>
            <p className="text-[#64748B] text-xs mt-0.5">
              Import or edit Master Data directly in Product Master so Recipes, Machines, and Barcode checks stay in sync.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className={subtleButton}>
          <Link to="/product-master">
            Open Product Master <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
        </Button>
      </div>

      <Tabs value={destination} onValueChange={setDestination}>
        <TabsList className="bg-white border border-[#E2E8F0] flex-wrap h-auto">
          {IMPORT_ENTITY_CONFIGS.map((c) => (
            <TabsTrigger key={c.entity} value={c.entity} className="data-[state=active]:bg-[#0F294A] data-[state=active]:text-white text-[#64748B]">
              {c.tabLabel}
            </TabsTrigger>
          ))}
          <TabsTrigger value="sheet_migration" className="data-[state=active]:bg-[#0F294A] data-[state=active]:text-white text-[#64748B]">
            Forecasts &amp; Opening Stock
          </TabsTrigger>
        </TabsList>
        {IMPORT_ENTITY_CONFIGS.map((c) => (
          <TabsContent key={c.entity} value={c.entity} className="mt-3">
            <CsvImportPanel config={c} />
          </TabsContent>
        ))}
        <TabsContent value="sheet_migration" className="mt-3">
          <SheetMigration embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}