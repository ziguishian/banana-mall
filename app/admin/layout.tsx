"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, KeyRound, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d?.success && d.data.role === "admin")))
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) {
    return <div className="flex min-h-[400px] items-center justify-center text-sm text-muted-foreground">加载中...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">无权访问管理后台</p>
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首页
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = [
    { label: "用户管理", href: "/admin/users", icon: Users },
    { label: "系统配置", href: "/admin/settings", icon: KeyRound },
    { label: "其他设置", href: "/admin/other-settings", icon: Bell },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">管理后台</h1>
          <p className="mt-1 text-sm text-muted-foreground">用户、积分、公告、屏蔽词、邮件与支付配置</p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首页
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition",
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/8",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
