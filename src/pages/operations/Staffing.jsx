import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { statusChangeGuard } from "@/lib/permissions";
import RecordsTable from "@/components/factoryops/RecordsTable";
import EvidenceLink from "@/components/factoryops/EvidenceLink";
import { productionLines, lineCode } from "@/lib/shiftLogConstants";

const STATUSES = ["Open", "In Progress", "Overdue", "Completed", "Verified"];

const fields = [
  { key: "production_line", label: "Production Line", type: "line", options: productionLines, required: true },
  { key: "shift_date", label: "Shift Date", type: "date", required: true },
  { key: "shift_type", label: "Shift", type: "select", options: ["Morning", "Night"], default: "Morning" },
  { key: "planned_headcount", label: "Planned Headcount", type: "number" },
  { key: "actual_headcount", label: "Actual Headcount", type: "number" },
  { key: "gap_logged", label: "Staffing Gap Logged", type: "checkbox" },
  { key: "gap_reason", label: "Gap Reason", type: "text" },
  { key: "owner", label: "Owner", type: "user" },
  { key: "due_date", label: "Gap Resolution Due", type: "date" },
  { key: "evidence_file", label: "Evidence Attachment", type: "file" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const columns = [
  { key: "production_line", label: "Line", render: (r) => lineCode(r.production_line || "") || "—" },
  { key: "shift_date", label: "Date" },
  { key: "shift_type", label: "Shift" },
  { key: "planned_headcount", label: "Planned" },
  { key: "actual_headcount", label: "Actual" },
  { key: "gap_logged", label: "Gap", render: (r) => r.gap_logged ? <span className="text-amber-700">Yes</span> : "—" },
  { key: "gap_reason", label: "Gap Reason" },
  { key: "owner", label: "Owner" },
  { key: "due_date", label: "Due" },
  { key: "evidence_file_name", label: "Evidence", render: (r) => <EvidenceLink uri={r.evidence_file_uri} name={r.evidence_file_name} /> },
];

// Staffing: shift headcount plans against actuals, with gap logging. Items past
// their due date are swept to Overdue automatically from the Attention Dashboard.
export default function Staffing() {
  const { user } = useAuth();
  const guard = statusChangeGuard(user, { managerVerifies: true });

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6">
      <RecordsTable
        entity="StaffingRecord"
        title="Staffing Records"
        subtitle="Planned vs actual headcount and coverage gaps per line and shift."
        addLabel="Add Staffing Record"
        columns={columns}
        fields={fields}
        statuses={STATUSES}
        guard={guard}
      />
    </div>
  );
}