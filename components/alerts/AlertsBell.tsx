"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSession } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type AlertItem = {
  id: string;
  event_id: string;
  watchlist_id: string;
  created_at: string;
  read_at: string | null;
  event_title: string;
  watch_type: string | null;
  watch_value: string | null;
  watchlist_label: string | null;
};

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { dateStyle: "short" });
  } catch {
    return iso;
  }
}

export function AlertsBell() {
  const { session, user } = useSession();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(true);

  // Reset poll on new session (e.g. user switches accounts)
  useEffect(() => {
    setPollEnabled(true);
  }, [session?.access_token]);

  const fetchAlerts = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/alerts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        // 401/403 = no access; stop polling to avoid console spam
        if (res.status === 401 || res.status === 403) {
          setPollEnabled(false);
        }
        return;
      }
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!user || !pollEnabled) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(interval);
  }, [user, fetchAlerts, pollEnabled]);

  const handleMarkAsRead = useCallback(
    async (alertId: string) => {
      if (!session?.access_token) return;
      try {
        const res = await fetch(`/api/alerts/${alertId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, read_at: new Date().toISOString() } : a
          )
        );
      } catch {
        // ignore
      }
    },
    [session?.access_token]
  );

  if (!user) return null;

  const unreadCount = alerts.filter((a) => !a.read_at).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Alerts"
          className="relative"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold">Alerts</h3>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {loading && alerts.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Loading…
            </p>
          ) : alerts.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No alerts.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/map?eventId=${a.event_id}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        {a.event_title?.trim() || "Event"}
                      </Link>
                      {!a.read_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 text-xs"
                          onClick={() => handleMarkAsRead(a.id)}
                        >
                          Mark as read
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{relativeTime(a.created_at)}</span>
                      {a.watchlist_label && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{a.watchlist_label}</span>
                        </>
                      )}
                    </div>
                    <Link
                      href={`/map?eventId=${a.event_id}`}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      View event
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
