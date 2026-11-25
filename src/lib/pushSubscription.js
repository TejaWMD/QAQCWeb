import { managerSupabase } from "@/lib/managerSupabase";

export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BCEB9PkPPBOooUYwvmg1UZalOVO10DVdzsdCcKAoHFyARTSRsSjFogXcLzF0KSbLv6Z4IW548ttA0vCBfmMExqI";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function encodeSubscriptionKey(sub, keyName) {
  const raw = sub.getKey ? sub.getKey(keyName) : null;
  if (!raw) return "";
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function getSwRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.ready)
    );
  } catch {
    return null;
  }
}

async function saveSubscriptionToManagerDb(userId, sub) {
  const p256dh = encodeSubscriptionKey(sub, "p256dh");
  const auth = encodeSubscriptionKey(sub, "auth");

  const { error: upsertError } = await managerSupabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh,
        auth,
      },
      { onConflict: "user_id,endpoint" }
    );

  if (!upsertError) {
    return { ok: true };
  }

  await managerSupabase
    .from("push_subscriptions")
    .delete()
    .match({ user_id: userId, endpoint: sub.endpoint });

  const { error: insertError } = await managerSupabase
    .from("push_subscriptions")
    .insert([{ user_id: userId, endpoint: sub.endpoint, p256dh, auth }]);

  if (insertError) {
    return { ok: false, error: insertError.message || upsertError.message };
  }

  return { ok: true };
}

export function resolvePushUserId(user) {
  if (!user) return "";
  return String(user.portal_user_id || user.id || "").trim();
}

export async function getPushStatus(user) {
  const userId = resolvePushUserId(user);
  if (isIosDevice() && !isStandalonePwa()) {
    return {
      supported: false,
      needsIosInstall: true,
      permission: "unsupported",
      isSubscribed: false,
    };
  }

  if (!isPushSupported()) {
    return {
      supported: false,
      needsIosInstall: false,
      permission: "unsupported",
      isSubscribed: false,
    };
  }

  const permission = Notification.permission;
  const reg = await getSwRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  if (!sub || permission !== "granted") {
    return {
      supported: true,
      needsIosInstall: false,
      permission,
      isSubscribed: false,
    };
  }

  if (userId) {
    try {
      const { data, error } = await managerSupabase
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", userId);

      const hasEndpoint =
        !error && Array.isArray(data) && data.some((row) => row.endpoint === sub.endpoint);

      if (!hasEndpoint) {
        await saveSubscriptionToManagerDb(userId, sub);
      }
    } catch {
      // Non-blocking sync
    }
  }

  return {
    supported: true,
    needsIosInstall: false,
    permission,
    isSubscribed: true,
  };
}

export async function enablePushNotifications(user) {
  const userId = resolvePushUserId(user);
  if (!userId) {
    return {
      ok: false,
      status: await getPushStatus(user),
      message: "Sign in to enable background push notifications.",
    };
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return {
      ok: false,
      status: await getPushStatus(user),
      message:
        "On iPhone/iPad, tap Share -> Add to Home Screen first, then open QAQC Web from your Home Screen.",
    };
  }

  if (!isPushSupported()) {
    return {
      ok: false,
      status: await getPushStatus(user),
      message: "Push notifications are not supported in this browser (HTTPS required).",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      status: await getPushStatus(user),
      message:
        permission === "denied"
          ? "Notifications are blocked in your browser/device settings."
          : "Notification permission was dismissed.",
    };
  }

  const reg = await getSwRegistration();
  if (!reg) {
    return {
      ok: false,
      status: await getPushStatus(user),
      message: "Service Worker is not ready yet. Please reload and try again.",
    };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const saved = await saveSubscriptionToManagerDb(userId, sub);
  const status = await getPushStatus(user);

  if (!saved.ok) {
    return {
      ok: false,
      status,
      message: `Permission granted, but failed to save subscription: ${saved.error}`,
    };
  }

  return { ok: true, status };
}

export async function disablePushNotifications(user) {
  const userId = resolvePushUserId(user);
  const reg = await getSwRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  if (sub) {
    if (userId) {
      try {
        await managerSupabase
          .from("push_subscriptions")
          .delete()
          .match({ user_id: userId, endpoint: sub.endpoint });
      } catch {
        // Ignore DB delete error
      }
    }
    try {
      await sub.unsubscribe();
    } catch {
      // Ignore browser unsubscribe error
    }
  }

  return { ok: true, status: await getPushStatus(user) };
}

// Silently ensure push subscription is active & synced when permission was already granted
export async function syncPushSubscriptionIfGranted(user) {
  const userId = resolvePushUserId(user);
  if (!userId || !isPushSupported() || Notification.permission !== "granted") {
    return;
  }
  try {
    const reg = await getSwRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await getPushStatus(user);
  } catch {
    // Non-blocking background sync
  }
}

export async function showSystemNotification(title, body, tag = "qaqc-alert", path = "/downtime") {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const iconUrl = `${window.location.origin}${import.meta.env.BASE_URL}pwa-192x192.png`;
  const options = {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag,
    data: { appId: "qaqc", path },
    vibrate: [200, 100, 200],
  };

  try {
    const reg = await getSwRegistration();
    if (reg && typeof reg.showNotification === "function") {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall back to window Notification
  }

  try {
    new Notification(title, { body, icon: iconUrl, tag });
  } catch {
    // Ignore
  }
}
