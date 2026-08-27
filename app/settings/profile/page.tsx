"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Headphones, KeyRound, LockKeyhole, Mail, MessageCircle, Save, ShieldCheck, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
};

const loginBindings = [
  { name: "邮箱", status: "已绑定", detail: "主邮箱在资料表单中管理", icon: Mail, tone: "mint" },
  { name: "LinuxDo", status: "未绑定", detail: "", iconText: "L", tone: "amber" },
  { name: "钉钉", status: "未绑定", detail: "", iconText: "D", tone: "blue" },
  { name: "OIDC", status: "未绑定", detail: "", iconText: "O", tone: "sky" },
  { name: "微信", status: "未绑定", detail: "", iconText: "W", tone: "green" },
];

function initialsFor(profile: Profile | null) {
  const source = profile?.name || profile?.email || "U";
  return (Array.from(source.trim())[0] ?? "U").toUpperCase();
}

function monthLabel(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
}

function errorMessage(data: { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } }, fallback: string) {
  const fieldErrors = data.error?.details?.fieldErrors;
  const firstField = fieldErrors ? Object.keys(fieldErrors).find((key) => fieldErrors[key]?.length) : undefined;
  if (firstField) return fieldErrors?.[firstField]?.[0] ?? fallback;
  return data.error?.message ?? fallback;
}

function IdentityMark({ children, className }: { children: string; className?: string }) {
  return <div className={cn("flex items-center justify-center rounded-2xl text-lg font-bold shadow-sm", className)}>{children}</div>;
}

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setName(data.data?.name ?? "");
      } else {
        toast.error(errorMessage(data, "加载个人资料失败"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const initials = useMemo(() => initialsFor(profile), [profile]);
  const displayName = profile?.name || profile?.email || "-";

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        toast.success("资料已更新");
      } else {
        toast.error(errorMessage(data, "更新资料失败"));
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const data = await res.json();
      if (data.success) {
        setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
        toast.success("密码已修改");
      } else {
        toast.error(errorMessage(data, "修改密码失败"));
      }
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-teal-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.9),rgba(255,255,255,0.92))] p-6 shadow-soft dark:border-teal-500/15 dark:bg-[linear-gradient(135deg,rgba(20,184,166,0.08),rgba(15,15,16,0.9))]">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <IdentityMark className="h-20 w-20 shrink-0 bg-teal-500 text-white shadow-lg shadow-teal-500/25">{initials}</IdentityMark>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{displayName}</h1>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{profile?.role === "admin" ? "管理员" : "用户"}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">启用</span>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/80 p-4 shadow-sm dark:bg-white/8">
                <p className="text-xs text-slate-400">账户余额</p>
                <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{profile?.credits ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-4 shadow-sm dark:bg-white/8">
                <p className="text-xs text-slate-400">使用数次</p>
                <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{profile?.credits ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-4 shadow-sm dark:bg-white/8">
                <p className="text-xs text-slate-400">注册时间</p>
                <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{monthLabel(profile?.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>资料与头像</CardTitle>
          <CardDescription>维护公开展示信息，并保持头像与昵称风格一致。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 p-6 dark:border-white/10">
            <IdentityMark className="h-16 w-16 bg-teal-500 text-white">{initials}</IdentityMark>
            <h3 className="mt-5 font-semibold text-slate-950 dark:text-white">资料头像</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">上传图片时会自动压缩静态图片到 20KB 以内，GIF 需自行控制在 20KB 以内。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" disabled>
                <Upload className="mr-2 h-4 w-4" />
                上传图片
              </Button>
              <Button size="sm" disabled>保存</Button>
              <Button variant="outline" size="sm" disabled>删除</Button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 p-6 dark:border-white/10">
            <h3 className="font-semibold text-slate-950 dark:text-white">编辑个人资料</h3>
            <div className="mt-5 space-y-3">
              <Label htmlFor="profile-name">用户名</Label>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="输入用户名" />
            </div>
            <div className="mt-8 flex justify-end">
              <Button onClick={saveProfile} disabled={savingProfile}>
                <Save className="mr-2 h-4 w-4" />
                {savingProfile ? "更新中..." : "更新资料"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登录方式绑定</CardTitle>
          <CardDescription>查看当前绑定状态，并将更多第三方登录方式关联到这个账号。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loginBindings.map((binding) => {
            const Icon = binding.icon;
            const bound = binding.status === "已绑定";
            return (
              <div key={binding.name} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4 dark:border-white/10">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold",
                      binding.tone === "mint" && "bg-teal-50 text-teal-600 dark:bg-teal-500/12 dark:text-teal-300",
                      binding.tone === "amber" && "bg-amber-50 text-amber-600 dark:bg-amber-500/12 dark:text-amber-300",
                      binding.tone === "blue" && "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300",
                      binding.tone === "sky" && "bg-sky-50 text-sky-600 dark:bg-sky-500/12 dark:text-sky-300",
                      binding.tone === "green" && "bg-green-50 text-green-600 dark:bg-green-500/12 dark:text-green-300",
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : binding.iconText}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-950 dark:text-white">{binding.name}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", bound ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400")}>{binding.status}</span>
                    </div>
                    {binding.name === "邮箱" ? <p className="mt-2 text-sm text-muted-foreground">{profile?.email}</p> : null}
                    {binding.detail ? <p className="mt-2 text-xs text-muted-foreground">{binding.detail}</p> : null}
                  </div>
                </div>
                {binding.name === "邮箱" ? <Button variant="outline" size="sm" disabled>管理邮箱</Button> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-5 dark:border-teal-500/20 dark:bg-teal-500/8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-950 dark:text-white">联系客服</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Clawapis</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">当前密码</Label>
            <Input id="current-password" type="password" value={passwords.currentPassword} onChange={(event) => setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <Input id="new-password" type="password" value={passwords.newPassword} onChange={(event) => setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))} />
            <p className="text-xs text-muted-foreground">密码至少需要 8 个字符</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">确认新密码</Label>
            <Input id="confirm-password" type="password" value={passwords.confirmPassword} onChange={(event) => setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={changePassword} disabled={savingPassword}>
              <LockKeyhole className="mr-2 h-4 w-4" />
              {savingPassword ? "修改中..." : "修改密码"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>双因素认证（2FA）</CardTitle>
          <CardDescription>使用 Google Authenticator 等应用增强账户安全</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 rounded-2xl p-4 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-white/8">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200">功能未开放</p>
              <p className="mt-1 text-sm">管理员尚未开放双因素认证功能</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
