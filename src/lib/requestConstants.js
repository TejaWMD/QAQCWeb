// Shared definitions for the Requests & Stoppages page: request types, owner
// teams, per-type form fields, status flows, form-config defaults, and who
// may act on incoming requests.
import { base44 } from "@/api/base44Client";
import { isAdminUser } from "@/lib/permissions";

export const REQUEST_TYPES = ["Downtime / Stoppage", "Item / Material Request", "Approval Request"];
export const DOWNTIME_TYPE = REQUEST_TYPES[0];
export const ITEM_TYPE = REQUEST_TYPES[1];
export const APPROVAL_TYPE = REQUEST_TYPES[2];

export const DOWNTIME_CATEGORIES = ["Mechanical", "Electrical", "Material Shortage", "Changeover", "Quality Hold", "Staffing", "Other"];
export const DOWNTIME_STATUSES = ["Open", "Resolved"];

export const OWNER_TEAMS = ["Maintenance", "QAQC", "Admin"];

// Normalize legacy owner labels ("QA/QC Team", "MD") and drop removed "Warehouse".
export const normalizeOwnerTeam = (team) => {
  const raw = String(team || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("warehouse")) return "";
  if (lower.includes("maintenance")) return "Maintenance";
  if (lower === "qaqc" || lower.includes("qa/qc") || lower.includes("qa qc") || lower === "qa" || lower === "qc") {
    return "QAQC";
  }
  if (lower === "md" || lower === "admin" || lower.includes("managing director")) {
    return "Admin";
  }
  return raw;
};

export const normalizeOwnerTeams = (teams) => {
  const arr = Array.isArray(teams)
    ? teams
    : typeof teams === "string"
      ? teams.split(",")
      : [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const normalized = normalizeOwnerTeam(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
};
export const URGENCIES = ["Normal", "Urgent", "Line stopped"];
export const ITEM_CATEGORIES = ["Tools & Equipment", "Spare Part", "Packaging", "Raw Material", "PPE", "Cleaning Supplies", "Other"];
export const APPROVAL_TYPES = [
  "Labelling / Packaging Error",
  "Overtime",
  "Line Restart after Stoppage",
  "Rework / Reprocessing",
  "Release of Held Product",
  "SOP / Specification Deviation",
  "Schedule Change",
  "Purchase / Spending",
  "Other",
];
export const PROPOSED_ACTIONS = ["Rework", "Reprint", "Hold", "Scrap", "Proceed with approval"];
export const PRINTED_ITEMS = ["Date code", "Shelf life", "Barcode", "Halal logo", "Allergen", "Ingredients"];

export const LABELLING_TYPE = "Labelling / Packaging Error";
export const REWORK_TYPE = "Rework / Reprocessing";
export const RELEASE_TYPE = "Release of Held Product";
export const PURCHASE_TYPE = "Purchase / Spending";
export const SOP_TYPE = "SOP / Specification Deviation";

// Evidence is required for downtime, optional for item requests, and required
// for these approval types (admins can change this in Settings).
export const EVIDENCE_REQUIRED_APPROVAL_TYPES = [LABELLING_TYPE, SOP_TYPE, REWORK_TYPE, RELEASE_TYPE];

// Status flows: Item / Material ends at Fulfilled, Approval at Completed.
export const ITEM_STATUSES = ["Submitted", "Under Review", "Approved", "Rejected", "Fulfilled"];
export const APPROVAL_STATUSES = ["Submitted", "Under Review", "Approved", "Rejected", "Returned for more info", "Completed"];
export const OPEN_REQUEST_STATUSES = ["Submitted", "Under Review", "Returned for more info"];

// Fields shown per request type: drives the form, the admin Settings dialog
// and the required-field checks. Hidden fields are never required or saved.
export const TYPE_FIELDS = {
  [DOWNTIME_TYPE]: [
    { key: "shift_date", label: "Shift Date" },
    { key: "shift_type", label: "Shift" },
    { key: "start_time", label: "Start Time (HH:MM)" },
    { key: "end_time", label: "End Time (HH:MM)" },
    { key: "duration_min", label: "Duration (minutes)" },
    { key: "category", label: "Category" },
    { key: "reason", label: "Reason" },
    { key: "immediate_action_taken", label: "Immediate Action Taken" },
    { key: "product_affected", label: "Product Affected" },
  ],
  [ITEM_TYPE]: [
    { key: "item_name", label: "Item Name" },
    { key: "quantity", label: "Quantity" },
    { key: "unit", label: "Unit" },
    { key: "urgency", label: "Urgency" },
    { key: "needed_by_date", label: "Needed By Date" },
    { key: "item_category", label: "Request Category" },
  ],
  [APPROVAL_TYPE]: [
    { key: "approval_type", label: "Approval Type" },
    { key: "description", label: "Description of the Issue" },
    { key: "product_sku", label: "Product / SKU" },
    { key: "batch_number", label: "Batch Number" },
    { key: "order_number", label: "Order Number" },
    { key: "quantity_affected", label: "Quantity Affected" },
    { key: "proposed_action", label: "Proposed Action" },
    { key: "impact_if_not_approved", label: "Impact if Not Approved" },
    { key: "needed_by_datetime", label: "Date/Time Action Is Needed By" },
    { key: "estimated_cost", label: "Estimated Cost" },
    { key: "printed_value", label: "Printed Value (Labelling Error)" },
    { key: "correct_value", label: "Correct Value (Labelling Error)" },
    { key: "printed_item", label: "What Was Printed (Labelling Error)" },
    { key: "qty_produced", label: "Quantity Already Produced (Labelling Error)" },
    { key: "already_packed", label: "Already Packed / Dispatched (Labelling Error)" },
    { key: "packed_qty", label: "Packed / Dispatched Quantity (Labelling Error)" },
    { key: "line_stopped", label: "Line Stopped (Labelling Error)" },
    { key: "ot_workers", label: "Number of Workers (Overtime)" },
    { key: "ot_hours", label: "Hours (Overtime)" },
    { key: "ot_reason", label: "Reason (Overtime)" },
    { key: "ot_date", label: "Date (Overtime)" },
    { key: "rework_reason", label: "Reason (Rework)" },
    { key: "rework_method", label: "Method (Rework)" },
    { key: "qa_signoff", label: "QA/QC Sign-off (Rework)" },
    { key: "hold_reference", label: "Hold Reference (Release of Held Product)" },
    { key: "qa_decision", label: "QA/QC Decision (Release of Held Product)" },
    { key: "purchase_amount", label: "Amount (Purchase / Spending)" },
    { key: "sop_reference", label: "SOP Reference (SOP Deviation)" },
    { key: "sop_deviation", label: "Deviation (SOP Deviation)" },
    { key: "sop_risk", label: "Risk (SOP Deviation)" },
    { key: "sop_duration", label: "Duration (SOP Deviation)" },
  ],
};

export const FIELD_LABELS = Object.fromEntries(Object.values(TYPE_FIELDS).flat().map((f) => [f.key, f.label]));

// Extra fields that appear only for specific approval types.
export const APPROVAL_CONDITIONAL_FIELDS = {
  [LABELLING_TYPE]: ["printed_value", "correct_value", "printed_item", "qty_produced", "already_packed", "packed_qty", "line_stopped"],
  Overtime: ["ot_workers", "ot_hours", "ot_reason", "ot_date"],
  [REWORK_TYPE]: ["rework_reason", "rework_method", "qa_signoff"],
  [RELEASE_TYPE]: ["hold_reference", "qa_decision"],
  [PURCHASE_TYPE]: ["purchase_amount"],
  [SOP_TYPE]: ["sop_reference", "sop_deviation", "sop_risk", "sop_duration"],
};

// Default required field keys per type (admins can change these in Settings).
export const DEFAULT_REQUIRED = {
  [DOWNTIME_TYPE]: ["shift_date", "reason"],
  [ITEM_TYPE]: ["item_name", "quantity"],
  [APPROVAL_TYPE]: ["approval_type", "description"],
};

// Default form config: editable by Admin in Settings (stored in FormConfig).
export const CONFIG_KEY = "request_form";
export const DEFAULT_FORM_CONFIG = {
  categories: DOWNTIME_CATEGORIES,
  approval_types: APPROVAL_TYPES,
  item_categories: ITEM_CATEGORIES,
  urgencies: URGENCIES,
  proposed_actions: PROPOSED_ACTIONS,
  owner_teams: OWNER_TEAMS,
  printed_items: PRINTED_ITEMS,
  evidence_required_downtime: true,
  evidence_required_approval_types: EVIDENCE_REQUIRED_APPROVAL_TYPES,
  purchase_md_limit: 500,
  required: DEFAULT_REQUIRED,
};

export const loadFormConfig = async () => {
  try {
    const page = await base44.entities.FormConfig.filter({ key: CONFIG_KEY }, { limit: 1 });
    const record = page.items?.[0];
    if (record) {
      const merged = { ...DEFAULT_FORM_CONFIG, ...record };
      const normalizedOwners = normalizeOwnerTeams(merged.owner_teams);
      return {
        ...merged,
        owner_teams: normalizedOwners.length ? normalizedOwners : OWNER_TEAMS,
      };
    }
  } catch {
    // Fall back to defaults when the config cannot be read.
  }
  return DEFAULT_FORM_CONFIG;
};

// Extract the assigned owner team(s) / person(s) for a Downtime or Request row.
export const rowOwnerTeams = (row) => {
  if (!row) return [];
  if (Array.isArray(row.owners) && row.owners.length > 0) {
    return normalizeOwnerTeams(row.owners);
  }
  if (row.owner) {
    return normalizeOwnerTeams(row.owner);
  }
  return [];
};

const userMatchesTeam = (user, team) => {
  if (!user || !team) return false;
  const canonical = normalizeOwnerTeam(team);
  const t = (canonical || String(team)).trim().toLowerCase();
  if (!t) return false;

  // Maintenance is general for now — any signed-in user can edit/change status.
  if (t.includes("maintenance")) {
    return true;
  }

  // QAQC: only users whose department is QAQC can change status.
  if (t === "qaqc" || t.includes("qa") || t.includes("qc")) {
    if (user.view_as_role) {
      return user.view_as_role === "qa_officer";
    }
    const dept = String(user.dept || user.department || "").trim().toLowerCase();
    return dept === "qaqc" || dept === "qa/qc" || dept === "qa & qc";
  }

  // Admin (formerly MD): only Admin users can change status.
  if (t === "admin" || t === "md" || t.includes("managing director")) {
    if (user.view_as_role) {
      return false;
    }
    return isAdminUser(user);
  }

  // Fallback for any custom team name
  const dept = String(user.dept || user.department || "").trim().toLowerCase();
  return dept === t;
};

// Purchase department users (non-admin) only see Approved Item / Material Requests.
export const isPurchaseDeptUser = (user) => {
  if (!user) return false;
  if (isAdminUser(user) && !user.view_as_role) return false;
  if (user.view_as_role) return user.view_as_role === "purchase";
  const dept = String(user.dept || user.department || "").trim().toLowerCase();
  const roleLabel = String(user.role_label || "").trim().toLowerCase();
  return /\b(purchase|purchasing|purchaser|procurement)\b/.test(`${dept} ${roleLabel}`);
};

// Owners and team reviewers can view the Incoming Requests tab.
export const canDecideRequests = (user) => {
  if (!user || isPurchaseDeptUser(user)) return false;
  return OWNER_TEAMS.some((t) => userMatchesTeam(user, t));
};

export const coversTeam = (user, teams) =>
  normalizeOwnerTeams(teams).some((t) => userMatchesTeam(user, t));

// Only the assigned owner can change the status of a request or stoppage:
// - Maintenance: any signed-in user
// - QAQC: only users with department = QAQC
// - Admin: only Admin users
export const canChangeRequestStatus = (user, row) => {
  if (!user || !row || isPurchaseDeptUser(user)) return false;
  const teams = rowOwnerTeams(row);
  if (!teams.length) return false;
  return coversTeam(user, teams);
};

export const statusesForType = (row) => {
  if (row._type === DOWNTIME_TYPE) return DOWNTIME_STATUSES;
  return row.request_type === ITEM_TYPE ? ITEM_STATUSES : APPROVAL_STATUSES;
};

export const TYPE_STYLES = {
  [DOWNTIME_TYPE]: "text-[#1D4ED8] border-[#BFD7FF] bg-[#EBF3FF]",
  [ITEM_TYPE]: "text-emerald-700 border-emerald-300 bg-emerald-50",
  [APPROVAL_TYPE]: "text-amber-700 border-amber-300 bg-amber-50",
};

export const URGENCY_STYLES = {
  "Line stopped": "text-rose-600 border-rose-300 bg-rose-600/10",
  Urgent: "text-amber-700 border-amber-300 bg-amber-50",
  Normal: "text-[#64748B] border-[#3a4560] bg-[#3a4560]/20",
};

// One-line summary of a request, used in tables, dialogs and audit entries.
export const requestSummary = (r) =>
  r?.request_type === ITEM_TYPE
    ? `${r.item_name || "Item"}${r.quantity ? ` × ${r.quantity}${r.unit ? " " + r.unit : ""}` : ""}`
    : `${r.approval_type || "Approval"}${r.description ? ` — ${r.description.slice(0, 50)}` : ""}`;