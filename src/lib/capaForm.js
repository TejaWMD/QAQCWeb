import { productionLines } from "@/lib/shiftLogConstants";

// Issue types for "Raise CAPA" per V3 specification.
// "Others" is pinned at the bottom and opens a free-text "Please specify" box.
export const OTHERS = "Others";

export const SALES_VISIBLE_ISSUE_TYPES = [
  "Complaints- sensory",
  "Complaints- foreign matter",
  "Returned- sensory issue",
  "Returned- spec not met",
];

export const ISSUE_TYPE_OPTIONS = [
  "Food safety",
  "Product quality",
  "Complaints- sensory",
  "Complaints- foreign matter",
  "Returned- sensory issue",
  "Returned- spec not met",
  "Supplier & Materials",
  "Hygiene & Facility",
  "Equipment",
  "People & documents",
  OTHERS,
];

export const CAPA_SOURCES = [
  "Defect",
  "Failed HACCP Check",
  "Downtime Event",
  "Audit Finding",
  "Customer Complaint",
  "Other",
];

export const capaFormFieldsForRole = (isSales = false) => [
  { key: "title", label: "CAPA Title", type: "text", required: true },
  {
    key: "issue_type",
    label: "Issue type",
    type: "select",
    options: isSales ? SALES_VISIBLE_ISSUE_TYPES : ISSUE_TYPE_OPTIONS,
    required: true,
  },
  ...(isSales
    ? []
    : [
        {
          key: "issue_other",
          label: "Please specify",
          placeholder: "Type the issue here",
          type: "textarea",
          required: true,
          showIf: (v) => v.issue_type === OTHERS,
        },
      ]),
  { key: "source_module", label: "Source", type: "select", options: CAPA_SOURCES, default: isSales ? "Customer Complaint" : "" },
  { key: "production_line", label: "Production Line", type: "line", options: productionLines },
  { key: "shift_date", label: "Date Raised", type: "date", required: true },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "description", label: "Problem", type: "textarea" },
  { key: "root_cause", label: "Root Cause", type: "textarea" },
  { key: "corrective_action", label: "Corrective Action", type: "textarea" },
  { key: "preventive_action", label: "Preventive Action", type: "textarea" },
  { key: "owner", label: "Owner", type: "user" },
  { key: "evidence_file", label: "Evidence Attachment", type: "file" },
  { key: "notes", label: "Notes", type: "textarea" },
];

// Shared by the QA & HACCP "Raise CAPA" button and the CAPA Tracker.
export const capaFormFields = capaFormFieldsForRole(false);
