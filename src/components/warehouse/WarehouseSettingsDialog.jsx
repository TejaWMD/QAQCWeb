import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RackSettingsCard from "@/components/warehouse/RackSettingsCard";
import UnitSettingsCard from "@/components/warehouse/UnitSettingsCard";

// Warehouse settings (Admin and Warehouse Supervisor only): rack list and the
// units of measure offered when receiving goods.
export default function WarehouseSettingsDialog({ open, onClose, updatedBy }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Warehouse settings</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            Racks and units of measure used by the goods receiving form.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="racks">
          <TabsList className="bg-white border border-[#E2E8F0]">
            <TabsTrigger value="racks">Racks</TabsTrigger>
            <TabsTrigger value="units">Units of measure</TabsTrigger>
          </TabsList>
          <TabsContent value="racks" className="mt-3">
            <RackSettingsCard />
          </TabsContent>
          <TabsContent value="units" className="mt-3">
            <UnitSettingsCard updatedBy={updatedBy} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}