"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Configs = Record<string, string>;

const FIELD_LABELS: Record<string, string> = {
  site_name: "站点名称",
  site_url: "站点 URL",
  email_enabled: "启用邮件发送",
  smtp_host: "SMTP 主机",
  smtp_port: "端口",
  smtp_user: "用户名",
  smtp_pass: "密码 / 授权码",
  smtp_from: "发件人地址",
  smtp_secure: "加密方式",
  payjs_mchid: "商户 ID",
  payjs_key: "商户密钥",
  payjs_type: "支付方式",
  payjs_notify_url: "异步通知 URL",
  payjs_api_url: "MZFPay API 地址",
  credits_per_yuan: "每元购买次数",
};

function normalizeBooleanConfig(value: string | undefined, fallback: "true" | "false") {
  const text = (value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on", "open", "enable", "enabled", "开启", "启用", "ssl/tls", "ssl/tls (465)"].includes(text)) return "true";
  if (["false", "0", "no", "off", "close", "disable", "disabled", "关闭", "停用", "starttls", "starttls (587)"].includes(text)) return "false";
  return fallback;
}

function normalizePayType(value: string | undefined) {
  return ["alipay", "wxpay", "qqpay"].includes(value ?? "") ? value! : "alipay";
}

function normalizeConfigValue(key: string, value: string | undefined) {
  if (key === "email_enabled") return normalizeBooleanConfig(value, "false");
  if (key === "smtp_secure") return normalizeBooleanConfig(value, "true");
  if (key === "payjs_type") return normalizePayType(value);
  return value ?? "";
}

function getErrorMessage(data: { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } }) {
  const fieldErrors = data.error?.details?.fieldErrors;
  const firstField = fieldErrors ? Object.keys(fieldErrors).find((key) => fieldErrors[key]?.length) : undefined;
  if (firstField) return `${FIELD_LABELS[firstField] ?? firstField}: ${fieldErrors?.[firstField]?.[0] ?? "参数不合法"}`;
  return data.error?.message ?? "操作失败";
}

const selectClass = "h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-black/30";

export default function AdminSettingsPage() {
  const [configs, setConfigs] = useState<Configs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "general" | "email" | "payjs">(null);
  const [testing, setTesting] = useState<null | "email" | "payjs">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.success) setConfigs(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update(key: string, value: string) {
    setConfigs((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSection(section: "general" | "email" | "payjs", keys: string[]) {
    setSaving(section);
    try {
      const payload: Record<string, string> = {};
      for (const key of keys) {
        payload[key] = normalizeConfigValue(key, configs[key]);
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data);
        toast.success("已保存");
      } else {
        toast.error(getErrorMessage(data));
      }
    } finally {
      setSaving(null);
    }
  }

  async function testConnection(type: "email" | "payjs") {
    setTesting(type);
    try {
      const res = await fetch("/api/admin/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.ok) toast.success(data.data.message);
        else toast.error(data.data.message);
      } else {
        toast.error(getErrorMessage(data));
      }
    } finally {
      setTesting(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
          <CardDescription>站点名称、URL。用于邮件、支付返回和通知等场景。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="site_name">站点名称</Label>
            <Input id="site_name" value={configs.site_name ?? ""} onChange={(e) => update("site_name", e.target.value)} placeholder="MxPage" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site_url">站点 URL</Label>
            <Input id="site_url" value={configs.site_url ?? ""} onChange={(e) => update("site_url", e.target.value)} placeholder="https://mxpage.example.com" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => saveSection("general", ["site_name", "site_url"])} disabled={saving === "general"}>
              {saving === "general" ? "保存中..." : "保存"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>邮件服务（SMTP）</CardTitle>
              <CardDescription>用于注册欢迎邮件。配置完成后可点击“测试连接”验证。</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => testConnection("email")} disabled={testing === "email"}>
              {testing === "email" ? "测试中..." : "测试连接"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="email_enabled">启用邮件发送</Label>
            <select id="email_enabled" value={normalizeBooleanConfig(configs.email_enabled, "false")} onChange={(e) => update("email_enabled", e.target.value)} className={`${selectClass} w-40`}>
              <option value="false">关闭</option>
              <option value="true">开启</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_host">SMTP 主机</Label>
            <Input id="smtp_host" value={configs.smtp_host ?? ""} onChange={(e) => update("smtp_host", e.target.value)} placeholder="smtp.example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_port">端口</Label>
            <Input id="smtp_port" type="number" value={configs.smtp_port ?? "465"} onChange={(e) => update("smtp_port", e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_user">用户名</Label>
            <Input id="smtp_user" value={configs.smtp_user ?? ""} onChange={(e) => update("smtp_user", e.target.value)} placeholder="noreply@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_pass">密码 / 授权码</Label>
            <Input id="smtp_pass" type="password" value={configs.smtp_pass ?? ""} onChange={(e) => update("smtp_pass", e.target.value)} placeholder="留空表示不修改" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_from">发件人地址</Label>
            <Input id="smtp_from" value={configs.smtp_from ?? ""} onChange={(e) => update("smtp_from", e.target.value)} placeholder="MxPage <noreply@example.com>" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtp_secure">加密方式</Label>
            <select id="smtp_secure" value={normalizeBooleanConfig(configs.smtp_secure, "true")} onChange={(e) => update("smtp_secure", e.target.value)} className={`${selectClass} w-44`}>
              <option value="true">SSL/TLS (465)</option>
              <option value="false">STARTTLS (587)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => saveSection("email", ["email_enabled", "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"])} disabled={saving === "email"}>
              {saving === "email" ? "保存中..." : "保存"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>支付配置（MZFPay 易支付）</CardTitle>
              <CardDescription>配置商户 ID、商户密钥和支付方式后，用户可在充值页跳转或扫码付款。数据库配置优先于 .env。</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => testConnection("payjs")} disabled={testing === "payjs"}>
              {testing === "payjs" ? "测试中..." : "测试下单"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payjs_mchid">商户 ID</Label>
            <Input id="payjs_mchid" value={configs.payjs_mchid ?? ""} onChange={(e) => update("payjs_mchid", e.target.value)} placeholder="例如 11800" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payjs_key">商户密钥</Label>
            <Input id="payjs_key" type="password" value={configs.payjs_key ?? ""} onChange={(e) => update("payjs_key", e.target.value)} placeholder="留空表示不修改" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payjs_type">支付方式</Label>
            <select id="payjs_type" value={normalizePayType(configs.payjs_type)} onChange={(e) => update("payjs_type", e.target.value)} className={`${selectClass} w-full`}>
              <option value="alipay">支付宝 (alipay)</option>
              <option value="wxpay">微信支付 (wxpay)</option>
              <option value="qqpay">QQ 钱包 (qqpay)</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="credits_per_yuan">每元购买次数</Label>
            <Input id="credits_per_yuan" type="number" min="1" value={configs.credits_per_yuan ?? "5"} onChange={(e) => update("credits_per_yuan", e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="payjs_notify_url">异步通知 URL</Label>
            <Input id="payjs_notify_url" value={configs.payjs_notify_url ?? ""} onChange={(e) => update("payjs_notify_url", e.target.value)} placeholder="https://your-domain.com/api/credits/payjs-notify" />
            <p className="text-xs text-muted-foreground">这里填你自己网站的公网 HTTPS 回调地址，路径固定为 <code>/api/credits/payjs-notify</code>。不要填写支付平台的 <code>checkOrder</code> 订单监控地址；本地 localhost 无法接收线上支付回调。</p>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="payjs_api_url">MZFPay API 地址</Label>
            <Input id="payjs_api_url" value={configs.payjs_api_url ?? ""} onChange={(e) => update("payjs_api_url", e.target.value)} placeholder="https://www.51pay.me/ 或 https://pay.mzfpay.com/xpay/epay/mapi.php" />
            <p className="text-xs text-muted-foreground">可填易支付接口根地址，系统会自动补全 <code>mapi.php</code> 下单和 <code>submit.php</code> 跳转，避免跨支付域名导致“没有找到商户信息”。</p>
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => saveSection("payjs", ["payjs_mchid", "payjs_key", "payjs_type", "payjs_notify_url", "payjs_api_url", "credits_per_yuan"])} disabled={saving === "payjs"}>
              {saving === "payjs" ? "保存中..." : "保存"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
