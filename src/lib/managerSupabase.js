import { createClient } from "@supabase/supabase-js";

const MANAGER_SUPABASE_URL =
  import.meta.env.VITE_MANAGER_SUPABASE_URL ||
  "https://mjrqamakqqsqqmuvaqpw.supabase.co";

const MANAGER_SUPABASE_ANON_KEY =
  import.meta.env.VITE_MANAGER_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcnFhbWFrcXFzcXFtdXZhcXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NjQyOTgsImV4cCI6MjEwODA0MDI5OH0.5VWlGTl87khT4JHlLLoT8IAwmceToyNZcN2EjfDohKg";

export const WMD_HUB_URL = "https://tejawmd.github.io/MainApp/";

// Isolated read-only Supabase client for ManagerDashboard's qaqc_muttha_queries view.
// Session persistence is disabled so it never touches QAQCWeb's own auth storage.
export const managerSupabase = createClient(
  MANAGER_SUPABASE_URL,
  MANAGER_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

function safeParseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeQueryRow(row) {
  if (!row) return null;
  const ccUsers = safeParseJsonArray(row.cc_users);
  const remarksLog = safeParseJsonArray(row.remarks_log);

  return {
    queryId: row.query_id || "",
    senderId: row.account_manager_id || "",
    senderName: row.account_manager_name || "Unknown",
    senderEmail: row.account_manager_email || "",
    managerId: row.manager_id || "",
    managerName: row.manager_name || "Unknown",
    managerEmail: row.manager_email || "",
    queryTitle: row.query_title || "",
    queryText: row.query_text || "",
    managerRemarkTitle: row.manager_remark_title || "",
    managerRemark: row.manager_remark || "",
    managerDone: Boolean(row.manager_done),
    managerDoneAt: row.manager_done_at || null,
    senderRemarkTitle: row.account_manager_remark_title || "",
    senderRemark: row.account_manager_remark || "",
    senderDone: Boolean(row.account_manager_done),
    status: row.status === "Completed" ? "Completed" : "Pending",
    createdAt: row.created_at || "",
    createdAtMs: Number(row.created_at_ms) || 0,
    completedAt: row.completed_at || null,
    completedAtMs: row.completed_at_ms ? Number(row.completed_at_ms) : null,
    isDelayed: Boolean(row.is_delayed),
    isUrgent: Boolean(row.is_urgent),
    targetDueAt: row.target_due_at || null,
    relation: row.muttha_relation || "to",
    ccUsers,
    remarksLog,
  };
}

export async function fetchMutthaQueries() {
  const { data, error } = await managerSupabase
    .from("qaqc_muttha_queries")
    .select("*")
    .order("created_at_ms", { ascending: false });

  if (error) {
    const code = error.code || "";
    const msg = error.message || "Failed to load queries from ManagerDashboard.";
    const isMissingView =
      code === "42P01" ||
      code === "PGRST205" ||
      msg.toLowerCase().includes("qaqc_muttha_queries");

    return {
      queries: [],
      error: msg,
      isMissingView,
    };
  }

  return {
    queries: (data || []).map(normalizeQueryRow).filter(Boolean),
    error: null,
    isMissingView: false,
  };
}

export function subscribeToMutthaQueries(onChange) {
  const channel = managerSupabase
    .channel("qaqc-muttha-queries-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queries" },
      () => {
        if (typeof onChange === "function") {
          onChange();
        }
      }
    )
    .subscribe();

  return () => {
    managerSupabase.removeChannel(channel);
  };
}
