"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type User = {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  creditMultiplier: number;
  role: string;
  createdAt: string;
  updatedAt: string;
  _count: { projects: number; orders: number };
};

type NewUserInput = {
  email: string;
  password: string;
  name: string;
  credits: string;
  creditMultiplier: string;
  role: "user" | "admin";
};

const emptyInput: NewUserInput = {
  email: "",
  password: "",
  name: "",
  credits: "20",
  creditMultiplier: "1",
  role: "user",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [input, setInput] = useState<NewUserInput>(emptyInput);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; delta: string; reason: string; creditMultiplier: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [globalMultiplier, setGlobalMultiplier] = useState("1");
  const [savingGlobalMultiplier, setSavingGlobalMultiplier] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          name: input.name || undefined,
          credits: Number(input.credits) || 0,
          creditMultiplier: Number(input.creditMultiplier) || 1,
          role: input.role,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? "创建失败");
        return;
      }
      toast.success(`已创建用户 ${input.email}`);
      setInput(emptyInput);
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRole(user: User) {
    const nextRole = user.role === "admin" ? "user" : "admin";
    if (user.role === "admin" && !window.confirm(`确认将 ${user.email} 降级为普通用户？`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(nextRole === "admin" ? "已升级为管理员" : "已降级为普通用户");
      load();
    } else {
      toast.error(data.error?.message ?? "操作失败");
    }
  }

  async function handleDelete(user: User) {
    if (!window.confirm(`确认删除用户 ${user.email}？该用户的所有项目和订单也会被删除。`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("已删除");
      load();
    } else {
      toast.error(data.error?.message ?? "删除失败");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const delta = Number(editing.delta);
      const multiplier = Number(editing.creditMultiplier) || 1;
      if ((!Number.isFinite(delta) || delta === 0) && multiplier <= 0) {
        toast.error("请输入有效的积分增减量或扣除倍率");
        return;
      }
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditDelta: delta,
          creditMultiplier: multiplier,
          reason: editing.reason || (delta > 0 ? "ADMIN_GRANT" : "ADMIN_DEDUCT"),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(delta > 0 ? `已加 ${delta} 次` : `已减 ${Math.abs(delta)} 次`);
        setEditing(null);
        load();
      } else {
        toast.error(data.error?.message ?? "操作失败");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function applyGlobalMultiplier() {
    const multiplier = Number(globalMultiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0.01) {
      toast.error("请输入不小于 0.01 的扣除倍率");
      return;
    }
    if (!window.confirm(`确认将全部用户扣除倍率改为 ${multiplier}？`)) return;
    setSavingGlobalMultiplier(true);
    try {
      const res = await fetch("/api/admin/users/bulk-multiplier", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditMultiplier: multiplier }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已应用到 ${data.data.count} 个用户`);
        load();
      } else {
        toast.error(data.error?.message ?? "全局应用失败");
      }
    } finally {
      setSavingGlobalMultiplier(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>全局扣除倍率</CardTitle>
          <CardDescription>倍率支持小数。0.01 表示使用一次生图扣除 0.01 积分，0.1 扣 0.1，1 扣 1。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="globalMultiplier">扣除倍率</Label>
            <Input id="globalMultiplier" type="number" min="0.01" step="0.01" value={globalMultiplier} onChange={(e) => setGlobalMultiplier(e.target.value)} className="w-40" />
          </div>
          <Button onClick={applyGlobalMultiplier} disabled={savingGlobalMultiplier}>{savingGlobalMultiplier ? "应用中..." : "一键全局应用"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>用户管理</CardTitle>
              <CardDescription>共 {users.length} 个用户</CardDescription>
            </div>
            <Button onClick={() => setShowAdd(!showAdd)}>{showAdd ? "取消" : "新增用户"}</Button>
          </div>
        </CardHeader>
        {showAdd && (
          <CardContent>
            <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-email">邮箱 *</Label>
                <Input id="new-email" type="email" required value={input.email} onChange={(e) => setInput({ ...input, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-password">初始密码 *</Label>
                <Input id="new-password" type="password" required value={input.password} onChange={(e) => setInput({ ...input, password: e.target.value })} placeholder="至少 6 位" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-name">昵称</Label>
                <Input id="new-name" value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} placeholder="可选" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-credits">初始积分</Label>
                <Input id="new-credits" type="number" min="0" value={input.credits} onChange={(e) => setInput({ ...input, credits: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-credit-multiplier">扣除倍率</Label>
                <Input id="new-credit-multiplier" type="number" min="0.01" step="0.01" value={input.creditMultiplier} onChange={(e) => setInput({ ...input, creditMultiplier: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-role">角色</Label>
                <select
                  id="new-role"
                  value={input.role}
                  onChange={(e) => setInput({ ...input, role: e.target.value as "user" | "admin" })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-black/30"
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex items-end md:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "创建中…" : "创建用户"}</Button>
              </div>
            </form>
          </CardContent>
        )}
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无用户</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3">邮箱</th>
                    <th className="pb-2 pr-3">昵称</th>
                    <th className="pb-2 pr-3">积分</th>
                    <th className="pb-2 pr-3">扣除倍率</th>
                    <th className="pb-2 pr-3">角色</th>
                    <th className="pb-2 pr-3">项目</th>
                    <th className="pb-2 pr-3">订单</th>
                    <th className="pb-2 pr-3">注册时间</th>
                    <th className="pb-2 pr-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-3 pr-3 font-medium">{user.email}</td>
                      <td className="py-3 pr-3">{user.name || "-"}</td>
                      <td className="py-3 pr-3">
                        <span className="font-semibold text-slate-900 dark:text-white">{user.credits}</span>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">x{user.creditMultiplier ?? 1}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            user.role === "admin"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400",
                          )}
                        >
                          {user.role === "admin" ? "管理员" : "用户"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{user._count.projects}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{user._count.orders}</td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleString("zh-CN")}</td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing({ id: user.id, delta: "", reason: "", creditMultiplier: String(user.creditMultiplier ?? 1) })}>
                            改积分
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleToggleRole(user)}>
                            {user.role === "admin" ? "降级" : "升级"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(user)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardHeader>
            <CardTitle>调整积分</CardTitle>
            <CardDescription>输入积分增减量（正数加，负数减），也可以单独修改扣除倍率。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="delta">增减量</Label>
              <Input
                id="delta"
                type="number"
                value={editing.delta}
                onChange={(e) => setEditing({ ...editing, delta: e.target.value })}
                placeholder="例如 100 或 -50"
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reason">备注（可选）</Label>
              <Input
                id="reason"
                value={editing.reason}
                onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                placeholder="手动调整"
                className="w-60"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="creditMultiplier">扣除倍率</Label>
              <Input
                id="creditMultiplier"
                type="number"
                min="0.01"
                step="0.01"
                value={editing.creditMultiplier}
                onChange={(e) => setEditing({ ...editing, creditMultiplier: e.target.value })}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? "保存中…" : "保存"}</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
