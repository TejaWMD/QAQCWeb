import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  isNotificationForUser,
  isNotificationRead,
  loadAllNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from "@/lib/notifications";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  showSystemNotification,
  syncPushSubscriptionIfGranted,
} from "@/lib/pushSubscription";

const POSITIVE_STATUSES = new Set(["Approved", "Resolved", "Completed", "Fulfilled"]);

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function NotificationBell({ compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [pushStatus, setPushStatus] = useState({ supported: false, isSubscribed: false, permission: "default", needsIosInstall: false });
  const [pushBusy, setPushBusy] = useState(false);
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  const refresh = useCallback(
    async (notifyNew = false) => {
      if (!user) return;
      const list = await loadAllNotifications();
      setAllItems(list);

      const mine = list.filter((n) => isNotificationForUser(n, user));
      if (!initializedRef.current) {
        mine.forEach((n) => seenIdsRef.current.add(n.id));
        initializedRef.current = true;
        return;
      }

      if (notifyNew) {
        mine.forEach((n) => {
          if (!seenIdsRef.current.has(n.id)) {
            seenIdsRef.current.add(n.id);
            if (!isNotificationRead(n, user)) {
              if (POSITIVE_STATUSES.has(n.status)) {
                toast.success(`${n.title}: ${n.message}`, { duration: 6000 });
              } else if (n.status === "Rejected") {
                toast.error(`${n.title}: ${n.message}`, { duration: 6000 });
              } else {
                toast.info(`${n.title}: ${n.message}`, { duration: 6000 });
              }
              if (typeof document !== "undefined" && document.hidden) {
                void showSystemNotification(n.title, n.message, n.id, n.path || "/downtime");
              }
            }
          }
        });
      }
    },
    [user]
  );

  useEffect(() => {
    initializedRef.current = false;
    seenIdsRef.current = new Set();
    refresh(false);
    const unsub = subscribeNotifications(() => refresh(true));
    return unsub;
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    void syncPushSubscriptionIfGranted(user).then(() => getPushStatus(user).then(setPushStatus));
  }, [user]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
    const onSwMessage = (event) => {
      if (event.data?.type === "QAQC_OPEN_PATH_FROM_NOTIFICATION" && event.data?.path) {
        navigate(event.data.path);
      }
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [navigate]);

  const handleTogglePush = async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushStatus.isSubscribed) {
        const res = await disablePushNotifications(user);
        setPushStatus(res.status);
        toast.info("Background push notifications turned off for this device.");
      } else {
        const res = await enablePushNotifications(user);
        setPushStatus(res.status);
        if (res.ok) {
          toast.success("Background push notifications enabled! You will be alerted even when the app is closed.");
        } else if (res.message) {
          toast.error(res.message);
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const myNotifications = useMemo(
    () => allItems.filter((n) => isNotificationForUser(n, user)),
    [allItems, user]
  );

  const unreadCount = useMemo(
    () => myNotifications.filter((n) => !isNotificationRead(n, user)).length,
    [myNotifications, user]
  );

  const handleOpenItem = async (item) => {
    await markNotificationRead(item.id, user);
    setOpen(false);
    if (item.path) navigate(item.path);
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead(user);
    await refresh(false);
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          className={`relative inline-flex items-center justify-center rounded-full border border-[#1e2740] bg-[#131926] text-[#cbd5e1] hover:text-white hover:bg-[#1e2740] transition-colors shrink-0 ${
            compact ? "w-8 h-8" : "w-9 h-9"
          }`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff4d4d] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0e131d]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 sm:w-96 p-0 bg-[#111827] border border-[#1e293b] text-slate-100 shadow-2xl"
      >
        <div className="px-3.5 py-2.5 border-b border-[#1e293b] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(pushStatus.supported || pushStatus.needsIosInstall) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pushBusy}
                onClick={handleTogglePush}
                title={pushStatus.isSubscribed ? "Background push alerts active (click to disable)" : "Enable background push alerts even when app is closed"}
                className={`h-6 px-2 text-[11px] ${
                  pushStatus.isSubscribed
                    ? "text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15"
                    : "text-amber-300 hover:text-amber-200 hover:bg-amber-500/15"
                }`}
              >
                <BellRing className="w-3 h-3 mr-1" />
                {pushStatus.isSubscribed ? "Push On" : "Enable Push"}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarkAll}
                className="h-6 px-2 text-[11px] text-cyan-300 hover:text-cyan-200 hover:bg-[#1e293b]"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-[#1e293b]">
          {myNotifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              No notifications yet.
            </p>
          ) : (
            myNotifications.slice(0, 30).map((item) => {
              const unread = !isNotificationRead(item, user);
              const positive = POSITIVE_STATUSES.has(item.status);
              const rejected = item.status === "Rejected";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-[#1e293b]/60 ${
                    unread ? "bg-cyan-500/[0.06]" : ""
                  }`}
                >
                  {positive ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : rejected ? (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${positive ? "text-emerald-300" : rejected ? "text-rose-300" : "text-amber-300"}`}>
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(item.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-snug">{item.message}</p>
                  </div>
                  {unread && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-1.5" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
