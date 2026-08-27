"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NoticeCard } from "@/components/shared/notice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assetTypeLabels, platformLabels, platformOptions, styleLabels, styleOptions } from "@/types/domain";

interface AnalysisWorkspaceProps {
  project: any;
  autoRunOnLoad?: boolean;
  initialNotice?: string;
  initialErrorCode?: string;
  source?: string;
}

function arrayToText(value?: string[]) {
  return (value ?? []).join("\n");
}

function textToArray(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
const additionalInformationTemplate = [
  "尺寸信息（必填）：长 × 宽 × 高 / 直径 / 适配规格，单位 cm 或 mm；未知请写“待补充”。",
  "重量 / 容量 / 功率：例如 500g、1.2L、1200W；不适用请写“不适用”。",
  "包装清单：主商品、配件、说明书、赠品等。",
  "安装 / 使用限制：适用场景、适配对象、禁用场景、是否需要插电/充电/固定。",
  "安全 / 合规提示：食品接触、儿童使用、防水等级、耐温范围等。",
  "不可出现的物理现象：例如线缆插入桌面、风向反吹、抽屉/开口方向错误、悬浮、阴影断裂。",
].join("\n");

const generationRequirementsTemplate = [
  "多角度：至少覆盖正面、45° 斜侧、俯视 / 侧面、细节特写，不要重复同一种构图。",
  "多使用场景：覆盖日常使用、收纳 / 携带、礼品 / 展示、真实操作过程等不同场景。",
  "不同使用方式：展示手持、摆放、搭配道具、步骤拆解或功能对比等方式。",
  "每张图要有明确差异：镜头、场景、道具、卖点、图内文案和 CTA 位置都应变化。",
  "商品主体必须保持一致：材质、颜色、比例、结构方向和关键识别点不能改变。",
].join("\n");

function withDefaultAdditionalInformation(value: any) {
  if (!value) return value;

  return {
    ...value,
    additionalInformation:
      typeof value.additionalInformation === "string" && value.additionalInformation.trim()
        ? value.additionalInformation
        : additionalInformationTemplate,
    generationRequirements:
      typeof value.generationRequirements === "string" && value.generationRequirements.trim()
        ? value.generationRequirements
        : generationRequirementsTemplate,
  };
}

export function AnalysisWorkspace({
  project,
  autoRunOnLoad = false,
  initialNotice,
  initialErrorCode,
  source,
}: AnalysisWorkspaceProps) {
  const [projectState, setProjectState] = useState(project);
  const [analysis, setAnalysis] = useState(withDefaultAdditionalInformation(project.analysis?.normalizedResult ?? null));
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const autoStartedRef = useRef(false);
  const analysisInFlightRef = useRef(false);

  const refreshProject = async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    const payload = await response.json();
    if (payload.success) {
      setProjectState(payload.data);
      setAnalysis(withDefaultAdditionalInformation(payload.data.analysis?.normalizedResult ?? null));
    }
  };

  const updateField = (key: string, value: unknown) => {
    setAnalysis((current: Record<string, unknown>) => ({
      ...(current ?? {}),
      [key]: value,
    }));
  };

  const updateProjectField = (key: string, value: unknown) => {
    setProjectState((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveProjectMeta = async () => {
    setSavingProject(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectState.name,
          platform: projectState.platform,
          style: projectState.style,
          description: projectState.description ?? "",
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "项目信息保存失败");
      }
      toast.success("项目信息已保存");
      await refreshProject();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目信息保存失败");
    } finally {
      setSavingProject(false);
    }
  };

  const runAnalysis = async (options?: { silentSuccess?: boolean }) => {
    if (analysisInFlightRef.current) {
      return;
    }
    analysisInFlightRef.current = true;
    setRunning(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "商品分析失败");
      }
      setAnalysis(withDefaultAdditionalInformation(payload.data.normalizedResult));
      await refreshProject();
      if (!options?.silentSuccess) {
        toast.success("AI 商品分析完成");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品分析失败");
    } finally {
      analysisInFlightRef.current = false;
      setRunning(false);
    }
  };

  useEffect(() => {
    if (initialNotice) {
      toast.warning(initialNotice);
    }
  }, [initialNotice]);

  useEffect(() => {
    if (!autoRunOnLoad || autoStartedRef.current || analysis || running) {
      return;
    }

    autoStartedRef.current = true;
    toast.message(
      source === "quick-start"
        ? initialErrorCode === "PROVIDER_TIMEOUT"
          ? "上一次分析超时，正在自动重试…"
          : "已进入分析页，正在继续自动分析…"
        : "正在自动分析…",
    );
    void runAnalysis({ silentSuccess: true });
  }, [analysis, autoRunOnLoad, initialErrorCode, running, source]);

  const reorderAsset = async (assetId: string, direction: -1 | 1) => {
    const currentIndex = projectState.assets.findIndex((asset: any) => asset.id === assetId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= projectState.assets.length) {
      return;
    }

    const reordered = [...projectState.assets];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    setProjectState((current: any) => ({ ...current, assets: reordered }));

    await Promise.all(
      reordered.map((asset: any, index: number) =>
        fetch(`/api/assets/${asset.id}/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: index }),
        }),
      ),
    );
    await refreshProject();
  };

  const deleteAsset = async (assetId: string) => {
    const response = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "素材删除失败");
      return;
    }
    toast.success("素材已删除");
    await refreshProject();
  };

  const setMainAsset = async (assetId: string) => {
    const response = await fetch(`/api/assets/${assetId}/set-main`, { method: "PATCH" });
    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "主图设置失败");
      return;
    }
    toast.success("主图已更新");
    await refreshProject();
  };

  const saveAnalysis = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/analysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalizedResult: withDefaultAdditionalInformation(analysis),
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "分析结果保存失败");
      }
      toast.success("分析结果已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分析结果保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>第 2 步：完善项目信息</CardTitle>
          <CardDescription>头图上传后，先把项目名称、平台、风格和备注补齐，后面的规划和生成都会使用这些信息。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>项目名称</Label>
              <Input value={projectState.name ?? ""} onChange={(event) => updateProjectField("name", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>平台</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm"
                value={projectState.platform}
                onChange={(event) => updateProjectField("platform", event.target.value)}
              >
                {platformOptions.map((option) => (
                  <option key={option} value={option}>
                    {platformLabels[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>风格</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm"
                value={projectState.style}
                onChange={(event) => updateProjectField("style", event.target.value)}
              >
                {styleOptions.map((option) => (
                  <option key={option} value={option}>
                    {styleLabels[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>备注</Label>
              <Textarea
                value={projectState.description ?? ""}
                onChange={(event) => updateProjectField("description", event.target.value)}
              />
            </div>
          </div>

          <Button onClick={saveProjectMeta} disabled={savingProject}>
            {savingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存项目信息
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <Card>
          <CardHeader>
            <CardTitle>第 3 步：素材与自动分析</CardTitle>
            <CardDescription>主图已经作为起点上传。这里可以继续调整主图、排序和补充素材，然后重新运行 AI 分析。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {projectState.assets.map((asset: any, index: number) => (
                <div key={asset.id} className="overflow-hidden rounded-2xl border border-border bg-muted/60">
                  <div className="aspect-square bg-slate-100">
                    {asset.url ? <img src={asset.url} alt={asset.fileName} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{assetTypeLabels[asset.type as keyof typeof assetTypeLabels] ?? asset.type}</Badge>
                      {asset.isMain ? <Badge variant="success">主图</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{asset.fileName}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => reorderAsset(asset.id, -1)} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reorderAsset(asset.id, 1)}
                        disabled={index === projectState.assets.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      {!asset.isMain ? (
                        <Button variant="ghost" size="sm" onClick={() => setMainAsset(asset.id)}>
                          <Star className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => deleteAsset(asset.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => void runAnalysis()} disabled={running} className="w-full">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              重新运行 AI 商品分析
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              商品分析图最多取前 10 张，请合理规划分析图。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分析结果确认</CardTitle>
            <CardDescription>这里是结构化商品分析结果。确认后就可以继续进入页面规划。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!analysis ? (
              <>
              <NoticeCard
                variant="info"
                title="当前还没有分析结果"
                description="你可以点击左侧按钮重新发起 AI 商品分析。分析完成后，这里会显示结构化字段，并可以继续进入页面规划。"
              />
              <div className="hidden">
                当前还没有分析结果，你可以点击左侧按钮重新发起 AI 商品分析。
              </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["productName", "商品名称"],
                    ["category", "品类"],
                    ["subcategory", "子类目"],
                    ["material", "材质"],
                    ["color", "颜色"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input value={(analysis as any)[key] ?? ""} onChange={(event) => updateField(key, event.target.value)} />
                    </div>
                  ))}
                </div>

                {[
                  ["styleTags", "风格标签"],
                  ["targetAudience", "目标人群"],
                  ["usageScenarios", "使用场景"],
                  ["coreSellingPoints", "核心卖点"],
                  ["differentiationPoints", "差异化亮点"],
                  ["userConcerns", "用户顾虑"],
                  ["recommendedFocusPoints", "推荐重点"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Textarea
                      value={arrayToText((analysis as any)[key])}
                      onChange={(event) => updateField(key, textToArray(event.target.value))}
                    />
                  </div>
                ))}

                <div className="space-y-2 rounded-3xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>其他信息补充（含尺寸信息）</Label>
                        <Badge variant="warning">建议必填</Badge>
                      </div>
                      <p className="text-xs leading-6 text-amber-800/80 dark:text-amber-200/80">
                        尺寸、重量、容量、适配规格和使用限制会直接影响详情页规划与图像生成的物理准确性。
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateField("additionalInformation", additionalInformationTemplate)}>
                      使用预置模板
                    </Button>
                  </div>
                  <Textarea
                    rows={8}
                    value={(analysis as any).additionalInformation ?? additionalInformationTemplate}
                    onChange={(event) => updateField("additionalInformation", event.target.value)}
                    placeholder={additionalInformationTemplate}
                  />
                </div>
                <div className="space-y-2 rounded-3xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>生图补充要求</Label>
                        <Badge variant="outline">影响规划与生成</Badge>
                      </div>
                      <p className="text-xs leading-6 text-sky-800/80 dark:text-sky-200/80">
                        用来约束后续页面规划和实际图片生成，例如多角度、多使用场景、不同使用方式、构图差异和不可改变的商品特征。
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateField("generationRequirements", generationRequirementsTemplate)}>
                      使用多场景模板
                    </Button>
                  </div>
                  <Textarea
                    rows={7}
                    value={(analysis as any).generationRequirements ?? generationRequirementsTemplate}
                    onChange={(event) => updateField("generationRequirements", event.target.value)}
                    placeholder={generationRequirementsTemplate}
                  />
                </div>
                <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                  <Button onClick={saveAnalysis} disabled={saving} variant="outline">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    保存分析结果
                  </Button>
                  <Link
                    href={`/projects/${project.id}/planner`}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-semibold text-white shadow-[0_18px_34px_-18px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_22px_40px_-20px_rgba(15,23,42,0.75)] dark:bg-white dark:text-black dark:hover:bg-slate-100"
                  >
                    进入页面规划
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
