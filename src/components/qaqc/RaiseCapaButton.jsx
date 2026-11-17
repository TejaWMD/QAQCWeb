import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { actingUserName } from "@/lib/permissions";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import AddRecordDialog from "@/components/factoryops/AddRecordDialog";
import { capaFormFields } from "@/lib/capaForm";

// "Raise CAPA" button for the QA & HACCP page. The record lands in the Unified
// CAPA Tracker as Open. Shown only to the QA/QC team (and the MD / admins).
export default function RaiseCapaButton({ onRaised }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const submit = async (values) => {
    if (!values.issue_type) throw new Error("Please choose an issue type.");
    if (!String(values.title || "").trim()) throw new Error("CAPA Title is required.");
    if (values.issue_type === "Others" && !String(values.issue_other || "").trim()) {
      throw new Error("Please specify the issue.");
    }
    const created = await base44.entities.CAPA.create({
      ...values,
      issue_other: values.issue_type === "Others" ? values.issue_other.trim() : "",
      status: "Open",
      owner: values.owner || actingUserName(user),
    });
    try {
      await base44.entities.AuditLog.create({
        event_time: new Date().toISOString(),
        event_stamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        user_name: actingUserName(user),
        module: "QA & HACCP Safety",
        action: "Created",
        record_id: created?.id || "",
        details: `CAPA raised: ${values.title} (${values.issue_type})`,
        old_value: "",
        new_value: "Open",
      });
    } catch {
      // The audit trail must never block raising a CAPA.
    }
    toast({ title: "CAPA raised", description: "It now appears in the Unified CAPA Tracker." });
    onRaised?.(created);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-[#ff9f43] hover:bg-[#e68a2e] text-[#0a0e17] font-semibold">
        <AlertTriangle className="w-4 h-4 mr-1.5" /> Raise CAPA
      </Button>
      <AddRecordDialog open={open} onOpenChange={setOpen} title="Raise CAPA" fields={capaFormFields} onSubmit={submit} />
    </>
  );
}
