"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/store";

type Config = {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  createdAt: string;
};

export default function MyKeysPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTranslation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/providers");
      const data = await res.json();
      if (data.success) setConfigs(data.data);
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
      const res = await fetch("/api/user/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseUrl, apiKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error?.message ?? "Failed");
        return;
      }
      toast.success(t("credits.addedToast"));
      setName("");
      setBaseUrl("");
      setApiKey("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    const res = await fetch(`/api/user/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !active }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(active ? t("credits.disabled") : t("credits.enabled"));
      load();
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("credits.confirmDelete"))) return;
    const res = await fetch(`/api/user/providers/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("✓");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("credits.title")}</h1>
        <p
          className="mt-1 text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: t("credits.desc") }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("credits.addTitle")}</CardTitle>
          <CardDescription>{t("credits.addDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("credits.nameLabel")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("credits.namePlaceholder")} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="baseUrl">{t("credits.baseUrlLabel")}</Label>
              <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t("credits.baseUrlPlaceholder")} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="apiKey">{t("credits.apiKeyLabel")}</Label>
              <Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t("credits.apiKeyPlaceholder")} required />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("credits.addBtn")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("credits.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("credits.empty")}</p>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div key={config.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{config.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{config.baseUrl || "Default Base URL"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        config.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                          : "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400",
                      )}
                    >
                      {config.isActive ? t("credits.enabled") : t("credits.disabled")}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => toggle(config.id, config.isActive)}>
                      {config.isActive ? t("credits.disable") : t("credits.enable")}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(config.id)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
