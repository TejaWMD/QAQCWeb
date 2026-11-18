import { productionLines } from "@/lib/shiftLogConstants";

// Issue types for "Raise CAPA", grouped as in the design. "Others" is pinned at the
// bottom and opens a free-text "Please specify" box.
export const OTHERS = "Others";

export const ISSUE_TYPE_GROUPS = [
  {
    group: "Customer and returns",
    options: [
      "Returned goods · sensory issue",
      "Returned goods · specification not met",
      "Customer complaint · sensory",
      "Customer complaint · foreign matter",
      "Customer complaint · packaging",
    ],
  },
  {
    group: "In-process QC",
    options: ["CCP out of limit", "Fat globule out of limit"],
  },
];

export const CAPA_SOURCES = ["Defect", "Failed HACCP Check", "Downtime Event", "Audit Finding", "Other"];

// Shared by the QA & HACCP "Raise CAPA" button and the CAPA Tracker.
export const capaFormFields = [
  { key: "title", label: "CAPA Title", type: "text", required: true },
  { key: "issue_type", label: "Issue type", type: "select", options: [...ISSUE_TYPE_GROUPS, OTHERS], required: true },
  { key: "issue_other", label: "Please specify", type: "textarea", required: true, showIf: (v) => v.issue_type === OTHERS },
  { key: "source_module", label: "Source", type: "select", options: CAPA_SOURCES },
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
