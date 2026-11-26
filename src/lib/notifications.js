import { createClient } from "@supabase/supabase-js";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
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

async function resolvePushRecipients({
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
  const recipientIds = new Set();
  const recipientEmails = new Set();

  const isActorUser = (u) => {
    const uid = String(u?.id || "").trim();
    const uemail = norm(u?.email);
    return (uid && actorIds.has(uid)) || (actorEmail && uemail && uemail === actorEmail);
  };

  const addMainAppUserIfEligible = (mainAppUser) => {
    if (!mainAppUser || !hasQaqcAppAccess(mainAppUser)) return false;
    if (isActorUser(mainAppUser)) return false;
    if (mainAppUser.id) recipientIds.add(String(mainAppUser.id).trim());
    if (mainAppUser.email) recipientEmails.add(norm(mainAppUser.email));
    return true;
  };

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

  // 2. Resolve the requester from MainApp's users table
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

    addMainAppUserIfEligible(matchedUser);
  } catch (err) {
    console.warn("Could not resolve MainApp requester for push notification:", err);
  }

  // Also include QAQCWeb requesterId / email directly if not the actor
  const cleanRequesterId = String(requesterId || "").trim();
  if (cleanRequesterId && !actorIds.has(cleanRequesterId) && !(actorEmail && targetEmail === actorEmail)) {
    recipientIds.add(cleanRequesterId);
  }
  if (targetEmail && targetEmail !== actorEmail) {
    recipientEmails.add(targetEmail);
  }

  // 3. Resolve all Admins from MainApp's users table so every admin is notified
  try {
    const { data: mainAdmins } = await mainAppSupabase
      .from("users")
      .select("id, name, email, role, department, status, accessible_apps")
      .ilike("role", "admin");
    if (Array.isArray(mainAdmins)) {
      mainAdmins.forEach((adminUser) => {
        addMainAppUserIfEligible(adminUser);
      });
    }
  } catch (err) {
    console.warn("Could not resolve MainApp admins for push notification:", err);
  }

  // 4. Also include QAQCWeb admins
  try {
    const { data: qaqcAdmins } = await supabase
      .from("users")
      .select("id, name, email, role")
      .in("role", ["admin", "super_admin"])
      .eq("deleted", false);
    if (Array.isArray(qaqcAdmins)) {
      for (const adminRow of qaqcAdmins) {
        if (isActorUser(adminRow)) continue;
        if (adminRow.id) recipientIds.add(String(adminRow.id).trim());
        if (adminRow.email) {
          recipientEmails.add(norm(adminRow.email));
          const { data: matchedMain } = await mainAppSupabase
            .from("users")
            .select("id, name, email, role, department, status, accessible_apps")
            .ilike("email", norm(adminRow.email))
            .limit(1);
          addMainAppUserIfEligible(Array.isArray(matchedMain) ? matchedMain[0] : null);
        }
      }
    }
  } catch {
    // Non-blocking lookup
  }

  return {
    recipientUserIds: Array.from(recipientIds),
    recipientEmails: Array.from(recipientEmails),
  };
}

function formatStatusNotification(status, summary, decidedBy, comment) {
  const s = String(status || "").trim();
  const sLower = s.toLowerCase();
  const iconPrefix =
    s === "Approved" || s === "Resolved" || s === "Completed" || s === "Fulfilled"
      ? "✅"
      : s === "Rejected"
      ? "❌"
      : s === "Returned for more info"
      ? "↩️"
      : s === "Under Review"
      ? "👀"
      : "🔔";
  const title = s === "Resolved" ? "Stoppage Resolved" : `Request ${s}`;
  const pushTitle = `${iconPrefix} ${title} (QAQC Web)`;
  const actor = decidedBy || "Owner";
  const commentPart = comment ? ` — ${comment}` : "";
  const message = `${summary || "Request"} status changed to ${sLower} by ${actor}${commentPart}`;
  return { title, pushTitle, message };
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
    const { recipientUserIds, recipientEmails } = await resolvePushRecipients({
      requesterId,
      requesterName,
      requesterEmail,
      decidedById,
      decidedByPortalId,
      decidedByEmail,
    });

    if (recipientUserIds.length === 0 && recipientEmails.length === 0) return;

    const { pushTitle, message } = formatStatusNotification(status, summary, decidedBy, comment);

    // Calls QAQCWeb's OWN Supabase Edge Function (completely separate from ManagerDashboard)
    const { error } = await supabase.functions.invoke("send-qaqc-push", {
      body: {
        event: "QAQC_REQUEST_STATUS_CHANGED",
        actorId: decidedByPortalId || decidedById || "",
        actorName: decidedBy || "",
        recipientEmails,
        recipientUserIds,
        title: pushTitle,
        body: message,
        tag: `qaqc-req-${recordId || Date.now()}-${norm(status).replace(/\s+/g, "-")}`,
        data: {
          appId: "qaqc",
          path: "/downtime",
          recordId: recordId || "",
          status,
          event: "QAQC_REQUEST_STATUS_CHANGED",
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

  // Never notify the actor who initiated the status change
  const actorId = String(notif.decided_by_id || notif.actor_id || "").trim();
  const actorEmail = norm(notif.decided_by_email || notif.actor_email);
  if (actorId && myId && actorId === myId) return false;
  if (actorEmail && myEmail && actorEmail === myEmail) return false;

  const targetId = String(notif.target_user_id || "").trim();
  const targetName = norm(notif.target_user_name);
  const targetEmail = norm(notif.target_user_email);

  if (targetId && myId && targetId === myId) return true;
  if (targetEmail && myEmail && targetEmail === myEmail) return true;
  if (targetName && (myName === targetName || myEmail === targetName)) return true;

  // Notify admins for all request status changes (and legacy records without explicit target)
  if (isAdminUser(user) && notif.notify_admins !== false) return true;

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
  if (!status) return null;
  try {
    const existing = await loadAllNotifications();
    const { title, message } = formatStatusNotification(status, summary, decidedBy, comment);
    const item = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "request_status_changed",
      record_id: recordId || "",
      status,
      title,
      message,
      decided_by: decidedBy || "",
      decided_by_id: decidedById || "",
      decided_by_email: decidedByEmail || "",
      target_user_id: requesterId || "",
      target_user_name: requesterName || "",
      target_user_email: requesterEmail || "",
      notify_admins: true,
      owners: Array.isArray(owners) ? owners : [],
      path: "/downtime",
      created_at: new Date().toISOString(),
      read_by: [],
    };
    await saveAllNotifications([item, ...existing]);
    window.dispatchEvent(new CustomEvent("wmg:notifications-updated"));

    // Also send background PWA Web Push via shared push pipeline
    await dispatchQaqcWebPush({
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
  const handleVisible = () => {
    if (typeof document === "undefined" || !document.hidden) {
      onChange?.();
    }
  };
  const handleSwMessage = (event) => {
    if (event.data?.type === "SW_NOTIFICATION_RECEIVED") {
      onChange?.();
    }
  };

  window.addEventListener("wmg:notifications-updated", handleLocal);
  window.addEventListener("focus", handleLocal);
  document.addEventListener("visibilitychange", handleVisible);
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
  }
  const intervalId = window.setInterval(handleVisible, 10000);
  const unsub = base44.entities.FormConfig.subscribe(() => onChange?.());

  return () => {
    window.removeEventListener("wmg:notifications-updated", handleLocal);
    window.removeEventListener("focus", handleLocal);
    document.removeEventListener("visibilitychange", handleVisible);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    }
    window.clearInterval(intervalId);
    if (typeof unsub === "function") unsub();
  };
}
