import { base44 } from "@/api/base44Client";
import { isAdminUser } from "@/lib/permissions";

const STORAGE_KEY = "wmg_user_notifications";
const MAX_NOTIFICATIONS = 150;

const norm = (v) => String(v || "").trim().toLowerCase();

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
