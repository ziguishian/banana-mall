"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Announcement = {
  id: string;
  content: string;
  type: string;
  description: string | null;
  isActive: boolean;
  publishedAt: string;
};

type Configs = Record<string, string>;

type EditorState = {
  id?: string;
  content: string;
  type: string;
  description: string;
  publishedAt: string;
  isActive: boolean;
};

const emptyEditor: EditorState = {
  content: "",
  type: "default",
  description: "",
  publishedAt: new Date().toISOString().slice(0, 16),
  isActive: true,
};

function toLocalInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === "true";
}

export default function AdminOtherSettingsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [configs, setConfigs] = useState<Configs>({});
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [savingFilter, setSavingFilter] = useState(false);

  const filterEnabled = booleanValue(configs.sensitive_filter_enabled, false);
  const promptCheckEnabled = booleanValue(configs.sensitive_prompt_check_enabled, true);
  const violationChargeEnabled = booleanValue(configs.sensitive_violation_charge_enabled, false);
  const previewRows = useMemo(() => announcements.slice(0, 100), [announcements]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [announcementRes, configRes] = await Promise.all([
        fetch("/api/admin/announcements", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
      ]);
      const [announcementPayload, configPayload] = await Promise.all([announcementRes.json(), configRes.json()]);
      if (announcementPayload.success) setAnnouncements(announcementPayload.data);
      if (configPayload.success) setConfigs(configPayload.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateConfig(key: string, value: string) {
    setConfigs((current) => ({ ...current, [key]: value }));
  }

  function openEditor(item?: Announcement) {
    if (!item) {
      setEditor(emptyEditor);
      return;
    }
    setEditor({
      id: item.id,
      content: item.content,
      type: item.type,
      description: item.description ?? "",
      publishedAt: toLocalInputValue(item.publishedAt),
      isActive: item.isActive,
    });
  }

  async function saveAnnouncement() {
    if (!editor) return;
    setSavingAnnouncement(true);
    try {
      const res = await fetch(editor.id ? `/api/admin/announcements/${editor.id}` : "/api/admin/announcements", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editor.content,
          type: editor.type,
          description: editor.description,
          publishedAt: toIsoFromLocalInput(editor.publishedAt),
          isActive: editor.isActive,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message ?? "保存失败");
      toast.success("公告已保存");
      setEditor(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingAnnouncement(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("确认删除这条公告？")) return;
    const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("公告已删除");
      load();
    } else {
      toast.error(data.error?.message ?? "删除失败");
    }
  }

  async function saveFilterSettings() {
    setSavingFilter(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sensitive_filter_enabled: configs.sensitive_filter_enabled ?? "false",
          sensitive_prompt_check_enabled: configs.sensitive_prompt_check_enabled ?? "true",
          sensitive_violation_charge_enabled: configs.sensitive_violation_charge_enabled ?? "false",
          sensitive_violation_charge_amount: Number(configs.sensitive_violation_charge_amount ?? "0.05"),
          sensitive_words: configs.sensitive_words ?? "",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message ?? "保存失败");
      setConfigs(data.data);
      toast.success("屏蔽词过滤设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingFilter(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />系统公告管理</CardTitle>
              <CardDescription>可以发布系统通知和重要消息，前端显示最新 20 条。</CardDescription>
            </div>
            <Button onClick={() => openEditor()} className="gap-2"><Plus className="h-4 w-4" />添加公告</Button>
          </div>
        </CardHeader>
        <CardContent>
          {previewRows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">暂无公告</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3">内容</th>
                    <th className="pb-2 pr-3">发布时间</th>
                    <th className="pb-2 pr-3">类型</th>
                    <th className="pb-2 pr-3">说明</th>
                    <th className="pb-2 pr-3">状态</th>
                    <th className="pb-2 pr-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="max-w-[420px] truncate py-3 pr-3 font-medium">{item.content}</td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">{new Date(item.publishedAt).toLocaleString("zh-CN")}</td>
                      <td className="py-3 pr-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item.type || "默认"}</span></td>
                      <td className="py-3 pr-3 text-muted-foreground">{item.description || "-"}</td>
                      <td className="py-3 pr-3">{item.isActive ? "已启用" : "已停用"}</td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditor(item)} className="gap-1"><Edit3 className="h-3.5 w-3.5" />编辑</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteAnnouncement(item.id)} className="gap-1"><Trash2 className="h-3.5 w-3.5" />删除</Button>
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

      <Card>
        <CardHeader>
          <CardTitle>屏蔽词过滤设置</CardTitle>
          <CardDescription>适用于操练场及全平台生图相关功能。一行一个屏蔽词，不需要符号分割。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex h-[54px] items-center justify-between rounded-lg border px-4 text-sm font-medium">
              启用屏蔽词过滤功能
              <input type="checkbox" checked={filterEnabled} onChange={(event) => updateConfig("sensitive_filter_enabled", String(event.target.checked))} className="h-5 w-5 accent-emerald-600" />
            </label>
            <label className="flex h-[54px] items-center justify-between rounded-lg border px-4 text-sm font-medium">
              启用 Prompt 检查
              <input type="checkbox" checked={promptCheckEnabled} onChange={(event) => updateConfig("sensitive_prompt_check_enabled", String(event.target.checked))} className="h-5 w-5 accent-emerald-600" />
            </label>
            <label className="flex h-[54px] items-center justify-between rounded-lg border px-4 text-sm font-medium">
              启用违规扣费
              <input type="checkbox" checked={violationChargeEnabled} onChange={(event) => updateConfig("sensitive_violation_charge_enabled", String(event.target.checked))} className="h-5 w-5 accent-emerald-600" />
            </label>
            <div className="flex h-[54px] items-center gap-6 rounded-lg border px-4">
              <Label htmlFor="violationChargeAmount" className="shrink-0 text-sm font-medium">违规扣费金额</Label>
              <Input
                id="violationChargeAmount"
                type="number"
                min="0.0001"
                step="0.0001"
                value={configs.sensitive_violation_charge_amount ?? "0.0500"}
                onChange={(event) => updateConfig("sensitive_violation_charge_amount", event.target.value)}
                className="h-10 max-w-[220px]"
              />
            </div>
            <div className="rounded-lg border p-4 md:col-span-2">
              <Label htmlFor="sensitive_words">屏蔽词列表</Label>
              <Textarea id="sensitive_words" className="mt-2 min-h-[190px]" value={configs.sensitive_words ?? ""} onChange={(event) => updateConfig("sensitive_words", event.target.value)} placeholder={"test_sensitive\n身份证\n手机号"} />
              <p className="mt-2 text-xs text-muted-foreground">一行一个屏蔽词，不需要符号分割。命中后会拦截请求；开启违规扣费后会在基础积分外额外扣除上方设置的积分。</p>
            </div>
          </div>
          <Button onClick={saveFilterSettings} disabled={savingFilter}>{savingFilter ? "保存中..." : "保存屏蔽词过滤设置"}</Button>
        </CardContent>
      </Card>

      {editor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-[#18181a]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{editor.id ? "编辑公告" : "添加公告"}</h2>
              <button className="text-slate-500 hover:text-slate-900" onClick={() => setEditor(null)}>×</button>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="announcement_content">公告内容 *</Label>
                <Textarea id="announcement_content" className="mt-2 min-h-[96px]" maxLength={500} value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} />
                <p className="mt-1 text-right text-xs text-muted-foreground">{editor.content.length}/500</p>
              </div>
              <div>
                <Label htmlFor="announcement_time">发布日期 *</Label>
                <Input id="announcement_time" type="datetime-local" className="mt-2" value={editor.publishedAt} onChange={(event) => setEditor({ ...editor, publishedAt: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="announcement_type">公告类型</Label>
                <select id="announcement_type" className="mt-2 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-black/30" value={editor.type} onChange={(event) => setEditor({ ...editor, type: event.target.value })}>
                  <option value="default">默认</option>
                  <option value="notice">通知</option>
                  <option value="system">系统公告</option>
                </select>
              </div>
              <div>
                <Label htmlFor="announcement_description">说明信息</Label>
                <Input id="announcement_description" className="mt-2" value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} className="h-4 w-4 accent-slate-950" />
                启用公告
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditor(null)}>取消</Button>
              <Button onClick={saveAnnouncement} disabled={savingAnnouncement}>{savingAnnouncement ? "保存中..." : "保存"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
