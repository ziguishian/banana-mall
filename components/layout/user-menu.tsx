"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Headphones, KeyRound, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/store";
import { cn } from "@/lib/utils";

type Me = {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  role: string;
};

export type CurrentUserSummary = Me;

export function UserMenu({ user: userFromShell }: { user?: CurrentUserSummary | null }) {
  const [me, setMe] = useState<Me | null>(userFromShell ?? null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useTranslation();

  useEffect(() => {
    if (userFromShell !== undefined) {
      setMe(userFromShell);
      return;
    }
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.success) setMe(d.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userFromShell]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("\u5df2\u9000\u51fa\u767b\u5f55");
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  const display = me?.name || me?.email || "";
  const initials = useMemo(() => {
    const source = display.trim() || "U";
    const first = Array.from(source)[0] ?? "U";
    return first.toUpperCase();
  }, [display]);

  if (!me) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 pr-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:hover:border-white/20 dark:hover:bg-white/8"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-sm font-semibold text-white shadow-sm shadow-teal-500/20">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-32 truncate text-sm font-medium text-slate-900 dark:text-white">{display}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{me.role === "admin" ? t("common.adminBadge") : "User"}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[3.25rem] z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#151517]">
          <div className="border-b border-slate-100 p-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500 text-sm font-semibold text-white">{initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{display}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{me.email}</p>
              </div>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white"
            >
              <UserRound className="h-4 w-4 text-slate-400" />
              个人资料
            </Link>
            <Link
              href="/settings/providers"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white"
            >
              <KeyRound className="h-4 w-4 text-slate-400" />
              API 密钥
            </Link>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300">
              <Headphones className="h-4 w-4 text-slate-400" />
              <span>联系客服：Clawapis</span>
            </div>
          </div>

          <div className="border-t border-slate-100 p-1.5 dark:border-white/10">
            <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loading} className="h-10 w-full justify-start gap-2 rounded-xl px-3 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300">
              <LogOut className="h-4 w-4" />
              {t("common.logout")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
