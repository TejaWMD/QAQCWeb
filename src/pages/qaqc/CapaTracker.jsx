import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { appRoleOf } from "@/lib/permissions";
import RecordsTable from "@/components/factoryops/RecordsTable";
import EvidenceLink from "@/components/factoryops/EvidenceLink";
import { capaFormFields, SALES_VISIBLE_ISSUE_TYPES } from "@/lib/capaForm";

const STATUSES = ["Open", "In Progress", "Overdue", "Completed", "Verified"];

const fields = capaFormFields;

const fmtDate = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
};

const fmtTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const columns = [
  { key: "title", label: "CAPA" },
  {
    key: "issue_type",
    label: "Issue Type",
    render: (r) => (r.issue_type === "Others" ? `Others: ${r.issue_other || ""}` : r.issue_type || "—"),
  },
  { key: "source_module", label: "Source" },
  { key: "production_line", label: "Line" },
  { key: "shift_date", label: "Raised", render: (r) => fmtDate(r.shift_date) },
  { key: "due_date", label: "Due Date", render: (r) => fmtDate(r.due_date) },
  { key: "owner", label: "Owner" },
  { key: "verified_by", label: "Verified By" },
  {
    key: "status_updated_at",
    label: "Status Updated",
    render: (r) => fmtTimestamp(r.status_updated_at || r.verification_date || r.updated_date || r.updated_at),
  },
  {
    key: "evidence_file_name",
    label: "Evidence",
    render: (r) => <EvidenceLink uri={r.evidence_file_uri} name={r.evidence_file_name} />,
  },
];

// Unified CAPA Tracker: one list of all corrective and preventive actions.
// Sales team sees only the customer complaint / returned goods issue types.
// Status changes automatically record the date and time of the update.
export default function CapaTracker() {
  const { user } = useAuth();
  const isSales = appRoleOf(user) === "sales";

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6">
      <RecordsTable
        entity="CAPA"
        title="Unified CAPA Tracker"
        subtitle="Track and update CAPA status; status edits automatically record the date and time."
        addLabel="Raise CAPA"
        columns={columns}
        fields={fields}
        statuses={STATUSES}
        filterRows={isSales ? (r) => SALES_VISIBLE_ISSUE_TYPES.includes(r.issue_type) : undefined}
        canAdd={!isSales}
        canEdit={!isSales}
        canDelete={!isSales}
      />
    </div>
  );
}
