import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, CheckCheck, CheckCircle2, XCircle } from "lucide-react";
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
              if (n.status === "Approved") {
                toast.success(`${n.title}: ${n.message}`, { duration: 6000 });
              } else if (n.status === "Rejected") {
                toast.error(`${n.title}: ${n.message}`, { duration: 6000 });
              } else {
                toast.info(`${n.title}: ${n.message}`, { duration: 6000 });
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
        <div className="max-h-80 overflow-y-auto divide-y divide-[#1e293b]">
          {myNotifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              No notifications yet.
            </p>
          ) : (
            myNotifications.slice(0, 30).map((item) => {
              const unread = !isNotificationRead(item, user);
              const approved = item.status === "Approved";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-[#1e293b]/60 ${
                    unread ? "bg-cyan-500/[0.06]" : ""
                  }`}
                >
                  {approved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${approved ? "text-emerald-300" : "text-rose-300"}`}>
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
