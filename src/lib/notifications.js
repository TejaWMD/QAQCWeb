import { createClient } from "@supabase/supabase-js";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { managerSupabase } from "@/lib/managerSupabase";
import { isAdminUser } from "@/lib/permissions";

const MAIN_APP_SUPABASE_URL =
  import.meta.env.VITE_MAIN_APP_SUPABASE_URL ||
  "https://omkpwhlvidwyhdivqpoe.supabase.co";
const MAIN_APP_SUPABASE_ANON_KEY =
  import.meta.env.VITE_MAIN_APP_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ta3B3aGx2aWR3eWhkaXZxcG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzA3OTAsImV4cCI6MjExMDEwNjc5MH0.SQJg3p_400dPWFp_DZgfOAR-Y96OSarc2xCuoyoBHJw";

// Read-only MainApp client used only to resolve MainApp user IDs & app access for PWA Web Push.
const mainAppSupabase = createClient(MAIN_APP_SUPABASE_URL, MAIN_APP_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const STORAGE_KEY = "wmg_user_notifications";
const MAX_NOTIFICATIONS = 150;

const norm = (v) => String(v || "").trim().toLowerCase();

function hasQaqcAppAccess(mainAppUser) {
  if (!mainAppUser) return false;
  if (norm(mainAppUser.status) === "inactive") return false;
  if (norm(mainAppUser.role) === "admin") return true;
  if (Array.isArray(mainAppUser.accessible_apps) && mainAppUser.accessible_apps.includes("qaqc")) {
    return true;
  }
  return false;
}

async function resolvePushRecipientIds({
  requesterId = "",
  requesterName = "",
  requesterEmail = "",
  decidedById = "",
  decidedByPortalId = "",
  decidedByEmail = "",
}) {
  const actorIds = new Set(
    [decidedById, decidedByPortalId].map((v) => String(v || "").trim()).filter(Boolean)
  );
  const actorEmail = norm(decidedByEmail);

  let targetEmail = norm(requesterEmail);
  let targetName = norm(requesterName);

  // 1. If we don't have the requester's email yet, look it up in QAQCWeb's users table
  if (!targetEmail && (requesterId || targetName)) {
    try {
      let query = supabase
        .from("users")
        .select("id, name, email")
        .eq("deleted", false)
        .limit(1);
      if (requesterId) {
        query = query.eq("id", requesterId);
      } else {
        query = query.ilike("name", requesterName.trim());
      }
      const { data } = await query;
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.email) targetEmail = norm(row.email);
      if (!targetName && row?.name) targetName = norm(row.name);
    } catch {
      // Non-blocking lookup
    }
  }

  // 2. Resolve the requester's MainApp user_id (the key stored in push_subscriptions by MainApp PWA)
  const recipientIds = new Set();
  try {
    let matchedUser = null;
    if (targetEmail) {
      const { data } = await mainAppSupabase
        .from("users")
        .select("id, name, email, role, department, status, accessible_apps")
        .ilike("email", targetEmail)
        .limit(1);
      matchedUser = Array.isArray(data) ? data[0] : null;
    }
    if (!matchedUser && targetName) {
      const { data } = await mainAppSupabase
        .from("users")
        .select("id, name, email, role, department, status, accessible_apps")
        .ilike("name", requesterName.trim())
        .limit(1);
      matchedUser = Array.isArray(data) ? data[0] : null;
    }

    if (matchedUser?.id && hasQaqcAppAccess(matchedUser)) {
      const isActor =
        actorIds.has(String(matchedUser.id).trim()) ||
        (actorEmail && norm(matchedUser.email) === actorEmail);
      if (!isActor) {
        recipientIds.add(String(matchedUser.id).trim());
      }
    }
  } catch (err) {
    console.warn("Could not resolve MainApp user for push notification:", err);
  }

  // Fallback: if requesterId itself was already a MainApp ID and not the actor
  if (recipientIds.size === 0 && requesterId && !actorIds.has(String(requesterId).trim())) {
    recipientIds.add(String(requesterId).trim());
  }

  return Array.from(recipientIds);
}

async function dispatchQaqcWebPush({
  recordId,
  status,
  summary,
  decidedBy,
  decidedById = "",
  decidedByPortalId = "",
  decidedByEmail = "",
  comment = "",
  requesterId = "",
  requesterName = "",
  requesterEmail = "",
}) {
  try {
    const recipientUserIds = await resolvePushRecipientIds({
      requesterId,
      requesterName,
      requesterEmail,
      decidedById,
      decidedByPortalId,
      decidedByEmail,
    });

    if (recipientUserIds.length === 0) return;

    const iconPrefix = status === "Approved" ? "✅" : "❌";
    const title = `${iconPrefix} Request ${status} (QAQC Web)`;
    const body = `${summary || "Your request"} was ${status.toLowerCase()} by ${decidedBy || "Owner"}${comment ? ` — ${comment}` : ""}`;

    const { error } = await managerSupabase.functions.invoke("send-push", {
      body: {
        event: "QAQC_REQUEST_DECISION",
        actorId: decidedByPortalId || decidedById || "",
        actorName: decidedBy || "",
        recipientUserIds,
        title,
        body,
        tag: `qaqc-req-${recordId || Date.now()}-${status.toLowerCase()}`,
        data: {
          appId: "qaqc",
          path: "/downtime",
          recordId: recordId || "",
          status,
          event: "QAQC_REQUEST_DECISION",
        },
      },
    });

    if (error) {
      console.warn("QAQC Web Push dispatch error:", error.message);
    }
  } catch (err) {
    console.warn("QAQC Web Push dispatch failed:", err);
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota error
  }
}

export async function loadAllNotifications() {
  try {
    const page = await base44.entities.FormConfig.filter({ key: STORAGE_KEY }, { limit: 1 });
    const doc = (page.items || [])[0];
    const items = doc?.required?.items;
    if (Array.isArray(items)) {
      writeLocal(items);
      return items;
    }
  } catch {
    // fallback to localStorage
  }
  return readLocal();
}

async function saveAllNotifications(items) {
  const trimmed = (Array.isArray(items) ? items : []).slice(0, MAX_NOTIFICATIONS);
  writeLocal(trimmed);
  const recordPatch = { required: { items: trimmed } };
  const page = await base44.entities.FormConfig.filter({ key: STORAGE_KEY }, { limit: 1 });
  const existing = (page.items || [])[0];
  if (existing?.id) {
    await base44.entities.FormConfig.update(existing.id, recordPatch);
  } else {
    await base44.entities.FormConfig.create({ key: STORAGE_KEY, ...recordPatch });
  }
  return trimmed;
}

export function isNotificationForUser(notif, user) {
  if (!notif || !user) return false;
  const myId = String(user.id || "").trim();
  const myEmail = norm(user.email);
  const myName = norm(user.full_name || user.name);

  const targetId = String(notif.target_user_id || "").trim();
  const targetName = norm(notif.target_user_name);
  const targetEmail = norm(notif.target_user_email);

  if (targetId && myId && targetId === myId) return true;
  if (targetEmail && myEmail && targetEmail === myEmail) return true;
  if (targetName && (myName === targetName || myEmail === targetName)) return true;

  // If no explicit target user was stored on a legacy record, notify admins/relevant reviewers
  if (!targetId && !targetName && !targetEmail && isAdminUser(user)) return true;

  return false;
}

export function isNotificationRead(notif, user) {
  if (!notif || !user) return true;
  const uid = String(user.id || user.email || "").trim();
  return Array.isArray(notif.read_by) && notif.read_by.includes(uid);
}

export async function pushRequestDecisionNotification({
  recordId,
  status,
  summary,
  decidedBy,
  decidedById = "",
  decidedByPortalId = "",
  decidedByEmail = "",
  comment = "",
  requesterId = "",
  requesterName = "",
  requesterEmail = "",
  owners = [],
}) {
  if (!["Approved", "Rejected"].includes(status)) return null;
  try {
    const existing = await loadAllNotifications();
    const item = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "request_decision",
      record_id: recordId || "",
      status,
      title: `Request ${status}`,
      message: `${summary || "Your request"} was ${status.toLowerCase()} by ${decidedBy || "Owner"}${comment ? ` — ${comment}` : ""}`,
      decided_by: decidedBy || "",
      decided_by_id: decidedById || "",
      target_user_id: requesterId || "",
      target_user_name: requesterName || "",
      target_user_email: requesterEmail || "",
      owners: Array.isArray(owners) ? owners : [],
      path: "/downtime",
      created_at: new Date().toISOString(),
      read_by: [],
    };
    await saveAllNotifications([item, ...existing]);
    window.dispatchEvent(new CustomEvent("wmg:notifications-updated"));

    // Also send background PWA Web Push via MainApp's shared push pipeline
    void dispatchQaqcWebPush({
      recordId,
      status,
      summary,
      decidedBy,
      decidedById,
      decidedByPortalId,
      decidedByEmail,
      comment,
      requesterId,
      requesterName,
      requesterEmail,
    });

    return item;
  } catch (err) {
    console.warn("Could not save notification:", err);
    return null;
  }
}

export async function markNotificationRead(notificationId, user) {
  const uid = String(user?.id || user?.email || "").trim();
  if (!uid || !notificationId) return [];
  const list = await loadAllNotifications();
  const next = list.map((n) => {
    if (n.id !== notificationId) return n;
    const readBy = Array.isArray(n.read_by) ? n.read_by : [];
    if (readBy.includes(uid)) return n;
    return { ...n, read_by: [...readBy, uid] };
  });
  const saved = await saveAllNotifications(next);
  window.dispatchEvent(new CustomEvent("wmg:notifications-updated"));
  return saved;
}

export async function markAllNotificationsRead(user) {
  const uid = String(user?.id || user?.email || "").trim();
  if (!uid) return [];
  const list = await loadAllNotifications();
  const next = list.map((n) => {
    if (!isNotificationForUser(n, user)) return n;
    const readBy = Array.isArray(n.read_by) ? n.read_by : [];
    if (readBy.includes(uid)) return n;
    return { ...n, read_by: [...readBy, uid] };
  });
  const saved = await saveAllNotifications(next);
  window.dispatchEvent(new CustomEvent("wmg:notifications-updated"));
  return saved;
}

export function subscribeNotifications(onChange) {
  const handleLocal = () => onChange?.();
  window.addEventListener("wmg:notifications-updated", handleLocal);
  const unsub = base44.entities.FormConfig.subscribe(() => onChange?.());
  return () => {
    window.removeEventListener("wmg:notifications-updated", handleLocal);
    if (typeof unsub === "function") unsub();
  };
}
