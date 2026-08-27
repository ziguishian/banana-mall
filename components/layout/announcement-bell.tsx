"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Megaphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Announcement = {
  id: string;
  content: string;
  type: string;
  description: string | null;
  publishedAt: string;
  readAt: string | null;
};

type AnnouncementPayload = {
  unreadCount: number;
  announcements: Announcement[];
};

export function AnnouncementBell() {
  const [data, setData] = useState<AnnouncementPayload>({ unreadCount: 0, announcements: [] });
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const firstAnnouncement = data.announcements[0] ?? null;
  const hasAnnouncements = data.announcements.length > 0;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const payload = await res.json();
      if (payload.success) setData(payload.data);
    } catch {
      // announcement bell should never break the app shell
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoOpened && hasAnnouncements) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, hasAnnouncements]);

  const title = useMemo(() => (firstAnnouncement?.type === "notice" ? "通知" : "系统公告"), [firstAnnouncement]);

  async function mark(action: "read" | "close_today") {
    if (!firstAnnouncement) return;
    await fetch(`/api/announcements/${firstAnnouncement.id}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setOpen(false);
    load();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-slate-300 dark:hover:bg-white/8"
        title="系统公告"
      >
        <Bell className="h-4 w-4" />
        {data.unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white">
            {data.unreadCount > 99 ? "99+" : data.unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="pointer-events-none fixed inset-x-0 top-8 z-[90] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.45)] ring-1 ring-white dark:border-white/10 dark:bg-[#171719] dark:ring-white/5">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">系统公告</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                    <Bell className="h-3.5 w-3.5" />通知
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Megaphone className="h-3.5 w-3.5" />{title}
                  </span>
                </div>

                <div className={cn("mt-3", hasAnnouncements ? "" : "text-slate-500")}> 
                  {hasAnnouncements ? (
                    <>
                      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-900 dark:text-white">{firstAnnouncement.content}</p>
                      {firstAnnouncement.description ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{firstAnnouncement.description}</p> : null}
                      <p className="mt-2 text-xs text-slate-400">{new Date(firstAnnouncement.publishedAt).toLocaleString("zh-CN")}</p>
                    </>
                  ) : (
                    <p className="text-sm">暂无公告</p>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  {hasAnnouncements ? <Button size="sm" variant="outline" className="bg-white" onClick={() => mark("close_today")}>今日关闭</Button> : null}
                  {hasAnnouncements ? <Button size="sm" onClick={() => mark("read")}>关闭公告</Button> : <Button size="sm" onClick={() => setOpen(false)}>关闭</Button>}
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white" title="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
