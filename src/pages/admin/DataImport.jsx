import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import CsvImportPanel from "@/components/import/CsvImportPanel";
import ProductImportWizard from "@/components/productmaster/ProductImportWizard";
import { IMPORT_ENTITY_CONFIGS } from "@/lib/importEntityConfigs";
import { loadProductSettings } from "@/lib/productMaster";
import { loadRecipes } from "@/lib/recipeMaster";
import { panelClass, primaryButton } from "@/components/planning/styles";

// CSV Data Import (admin only): the Product Master datasheet plus the CSV
// exports from the original app. Imports never delete existing records.
export default function DataImport() {
  const [destination, setDestination] = useState(IMPORT_ENTITY_CONFIGS[0].entity);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [seed, setSeed] = useState({ products: [], recipes: [], settings: { id: "", brands: [], channels: [], mapping: null, mapping_signature: "" } });

  const openProductImport = async () => {
    const [productRows, recipeRows, settings] = await Promise.all([
      base44.entities.Product.list("product_code", 800),
      loadRecipes(),
      loadProductSettings(),
    ]);
    setSeed({
      products: Array.isArray(productRows) ? productRows : [],
      recipes: recipeRows,
      settings,
    });
    setWizardOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-[#0F294A] text-lg font-semibold">Import CSV Data</h2>
        <p className="text-[#64748B] text-sm mt-1">
          Upload CSV exports to add operational records or update Product Master.
        </p>
      </div>

      <div className={`${panelClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-[#0F294A] text-sm font-semibold">Product Master datasheet</p>
          <p className="text-[#64748B] text-xs mt-1">
            Upserts by Item Code with calculated filling and duplicate barcode checks.
          </p>
        </div>
        <Button onClick={openProductImport} className={primaryButton}>
          <Upload className="w-4 h-4 mr-1.5" /> Import datasheet
        </Button>
      </div>

      <Tabs value={destination} onValueChange={setDestination}>
        <TabsList className="bg-white border border-[#E2E8F0] flex-wrap h-auto">
          {IMPORT_ENTITY_CONFIGS.map((c) => (
            <TabsTrigger key={c.entity} value={c.entity} className="data-[state=active]:bg-[#0F294A] data-[state=active]:text-white text-[#64748B]">
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

      <ProductImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        products={seed.products}
        recipes={seed.recipes}
        settings={seed.settings}
        onSaved={() => {}}
      />
    </div>
  );
}