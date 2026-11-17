import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ItemForm from "@/components/warehouse/ItemForm";

// Quick "add new item" shortcut offered when an unknown item code is typed in.
export default function QuickAddItemDialog({ request, units, onClose, onCreated }) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-white border-[#E2E8F0] text-[#0F294A] max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F294A]">Add new item</DialogTitle>
          <DialogDescription className="text-[#64748B] text-sm">
            New code from the receiving form. It will be available for future receipts.
          </DialogDescription>
        </DialogHeader>
        {request && (
          <ItemForm
            initial={{ item_code: request.item_code, description: request.product_description }}
            units={units}
            onSaved={(item) => { onCreated?.(item, request.lineId); onClose(); }}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}