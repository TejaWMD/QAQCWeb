import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { statusChangeGuard } from "@/lib/permissions";
import RecordsTable from "@/components/factoryops/RecordsTable";
import EvidenceLink from "@/components/factoryops/EvidenceLink";
import { capaFormFields } from "@/lib/capaForm";

const STATUSES = ["Open", "In Progress", "Overdue", "Completed", "Verified"];

const fields = capaFormFields;

const columns = [
  { key: "title", label: "CAPA" },
  { key: "issue_type", label: "Issue Type", render: (r) => (r.issue_type === "Others" ? `Others: ${r.issue_other || ""}` : r.issue_type || "-") },
  { key: "source_module", label: "Source" },
  { key: "production_line", label: "Line" },
  { key: "shift_date", label: "Raised" },
  { key: "due_date", label: "Due Date" },
  { key: "owner", label: "Owner" },
  { key: "verified_by", label: "Verified By" },
  { key: "evidence_file_name", label: "Evidence", render: (r) => <EvidenceLink uri={r.evidence_file_uri} name={r.evidence_file_name} /> },
];

// Unified CAPA Tracker: one list of all corrective and preventive actions from
// defects, failed HACCP checks, downtime events and audit findings. A CAPA
// cannot be closed without evidence, or verified without a manager.
export default function CapaTracker() {
  const { user } = useAuth();

  const guard = statusChangeGuard(user, { requireEvidenceToComplete: true, managerVerifies: true });

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6">
      <RecordsTable
        entity="CAPA"
        title="Unified CAPA Tracker"
        subtitle="Closure requires evidence; verification requires a manager."
        addLabel="Raise CAPA"
        columns={columns}
        fields={fields}
        statuses={STATUSES}
        guard={guard}
      />
    </div>
  );
}