"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Images,
  Info,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { NoticeCard } from "@/components/shared/notice-card";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useImagePreview, type ImagePreviewPayload } from "@/components/shared/image-preview-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { contentLanguageLabels, type ContentLanguage } from "@/lib/utils/content-language";
import { buildDefaultVisualStyleGuide, normalizeVisualStyleGuide, type VisualStyleGuide } from "@/lib/utils/visual-style-guide";
import { sectionTypeLabels } from "@/types/domain";

interface PlannerWorkspaceProps {
  project: any;
}

interface PreviewConfig {
  heroImageCount: number;
  detailSectionCount: number;
  imageAspectRatio: "3:4" | "9:16";
  contentLanguage: ContentLanguage;
}

interface GenerationSettings {
  allowSvgFallback: boolean;
}

interface BulkProgressState {
  total: number;
  completed: number;
  failed: number;
  canceled: number;
  fallbackCount: number;
  currentTitle: string | null;
  currentSectionId: string | null;
  mode: "all" | "missing";
  running: boolean;
}

interface PlanningProgressState {
  stage: "idle" | "requesting" | "parsing" | "saving";
  detail: string;
}

interface PlanningTask {
  id: string;
  taskType: string;
  status: string;
  sectionId?: string | null;
  startedAt?: string | Date | null;
  createdAt?: string | Date | null;
  errorMessage?: string | null;
  outputPayload?: {
    totalItems?: number;
    completedItems?: number;
    failedItems?: number;
    canceledItems?: number;
    fallbackCount?: number;
    currentTitle?: string | null;
    currentSectionId?: string | null;
    currentTaskId?: string | null;
    mode?: "all" | "missing";
  } | null;
}

const activePlanningTaskMaxAgeMs = 10 * 60 * 1000;
const activeBulkGenerationTaskMaxAgeMs = 12 * 60 * 60 * 1000;

function getActivePlanningTask(project: any): PlanningTask | null {
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  const startedAfter = Date.now() - activePlanningTaskMaxAgeMs;

  return (
    tasks.find((task: PlanningTask) => {
      if (task.taskType !== "PLAN" || task.status !== "RUNNING" || !task.startedAt) {
        return false;
      }

      const startedAt = new Date(task.startedAt).getTime();
      return Number.isFinite(startedAt) && startedAt >= startedAfter;
    }) ?? null
  );
}

function getActiveBulkGenerationTask(project: any): PlanningTask | null {
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  const startedAfter = Date.now() - activeBulkGenerationTaskMaxAgeMs;

  return (
    tasks.find((task: PlanningTask) => {
      if (
        task.taskType !== "GENERATE" ||
        task.sectionId != null ||
        (task.status !== "PENDING" && task.status !== "RUNNING")
      ) {
        return false;
      }

      const taskTime = new Date(task.startedAt ?? task.createdAt ?? 0).getTime();
      return Number.isFinite(taskTime) && taskTime >= startedAfter;
    }) ?? null
  );
}

function getBulkProgressFromTask(task: PlanningTask, fallbackTotal: number, running: boolean): BulkProgressState {
  const output = task.outputPayload ?? {};
  return {
    total: Number(output.totalItems ?? fallbackTotal),
    completed: Number(output.completedItems ?? 0),
    failed: Number(output.failedItems ?? 0),
    canceled: Number(output.canceledItems ?? 0),
    fallbackCount: Number(output.fallbackCount ?? 0),
    currentTitle: output.currentTitle ?? null,
    currentSectionId: output.currentSectionId ?? null,
    mode: output.mode === "missing" ? "missing" : "all",
    running,
  };
}

const defaultPreviewConfig: PreviewConfig = {
  heroImageCount: 4,
  detailSectionCount: 6,
  imageAspectRatio: "9:16",
  contentLanguage: "zh-CN",
};

const defaultGenerationSettings: GenerationSettings = {
  allowSvgFallback: false,
};

const plannerSectionTypeOptions = [
  "hero",
  "selling_points",
  "scenario",
  "detail_closeup",
  "specs",
  "material",
  "comparison",
  "gift_scene",
  "brand_trust",
  "summary",
  "custom",
] as const;

const shellItems = [
  { title: "价格区", description: "展示价格、标签和商品描述，不进入 AI 可规划模块。" },
  { title: "用户评论", description: "作为商城壳层固定展示，不单独生成、不单独导出。" },
  { title: "底部购买栏", description: "固定显示客服、购物车、加入购物车、立即购买。" },
  { title: "Powered by", description: "固定作为页面收尾署名，不进入模块结构树。" },
];

function getPreviewConfig(project: any): PreviewConfig {
  const config = project?.modelSnapshot?.previewConfig ?? {};
  return {
    heroImageCount: Math.min(5, Math.max(1, Number(config.heroImageCount ?? defaultPreviewConfig.heroImageCount))),
    detailSectionCount: Math.min(
      10,
      Math.max(1, Number(config.detailSectionCount ?? defaultPreviewConfig.detailSectionCount)),
    ),
    imageAspectRatio: config.imageAspectRatio === "3:4" ? "3:4" : defaultPreviewConfig.imageAspectRatio,
    contentLanguage: config.contentLanguage ?? defaultPreviewConfig.contentLanguage,
  };
}

function getGenerationSettings(project: any): GenerationSettings {
  const settings = project?.modelSnapshot?.generationSettings ?? {};
  return {
    allowSvgFallback:
      typeof settings.allowSvgFallback === "boolean"
        ? settings.allowSvgFallback
        : defaultGenerationSettings.allowSvgFallback,
  };
}

function getVisualStyleGuide(project: any): VisualStyleGuide {
  const fallback = buildDefaultVisualStyleGuide({
    productName: project?.analysis?.normalizedResult?.productName ?? project?.name,
    styleLabel: project?.style,
    platformLabel: project?.platform,
  });
  return normalizeVisualStyleGuide(project?.modelSnapshot?.visualStyleGuide, fallback);
}

function getGenerationRequirements(project: any) {
  const value = project?.analysis?.normalizedResult?.generationRequirements;
  return typeof value === "string" ? value.trim() : "";
}

function hasSectionsSyncedGenerationRequirements(sections: any[], generationRequirements: string) {
  if (!generationRequirements) return true;
  if (!sections.length) return false;

  const requirementMarkers = ["生图补充要求", ...generationRequirements.split(/\s+/).filter((item) => item.length >= 4).slice(0, 3)];
  const combinedPrompt = sections.map((section) => section.visualPrompt ?? "").join("\n");
  return requirementMarkers.some((marker) => combinedPrompt.includes(marker));
}

function progressPercent(progress: BulkProgressState | null) {
  if (!progress || progress.total === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round(((progress.completed + progress.failed + progress.canceled) / progress.total) * 100),
  );
}

function getGenerationLabel(section: any) {
  const mode = section?.currentImageAsset?.metadata?.mode;
  if (mode === "image_api") return "AI 真图";
  if (mode === "svg_fallback") return "SVG 兜底";
  return "尚未生成";
}

function getPlannerPreviewAspectClass(aspectRatio: "1:1" | "3:4" | "9:16") {
  if (aspectRatio === "1:1") return "aspect-square";
  if (aspectRatio === "3:4") return "aspect-[3/4]";
  return "aspect-[9/16]";
}

function hasCompletedPreview(section: any) {
  return section.status === "SUCCESS";
}

function getPlannerCardContentClass(section: any) {
  const completedLayout = hasCompletedPreview(section)
    ? "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 xl:grid-cols-[236px_minmax(0,1fr)]"
    : "";

  return `space-y-3 p-4 pt-0 ${completedLayout}`;
}

function CompletedSectionPreview({
  section,
  aspectRatio,
  onPreview,
}: {
  section: any;
  aspectRatio: "1:1" | "3:4" | "9:16";
  onPreview: (image: ImagePreviewPayload) => void;
}) {
  if (section.status !== "SUCCESS") {
    return null;
  }

  if (!section.imageUrl) {
    return (
      <NoticeCard
        variant="warning"
        title="已完成但暂未找到图片"
        description="当前模块状态为已完成，但项目详情里没有返回图片地址。可以点击重生成，或进入编辑台查看版本记录。"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-slate-100 shadow-sm dark:bg-white/[0.04] lg:sticky lg:top-3">
      <button
        type="button"
        className={`group relative mx-auto block max-h-[300px] w-full cursor-zoom-in overflow-hidden text-left ${getPlannerPreviewAspectClass(aspectRatio)}`}
        onClick={() =>
          onPreview({
            url: section.imageUrl,
            title: section.title,
            meta: `${aspectRatio} ${section.type === "HERO" ? "头图" : "详情页"}`,
          })
        }
        aria-label={`放大查看 ${section.title}`}
      >
        <img src={section.imageUrl} alt={section.title} className="h-full w-full object-contain" />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
          <StatusBadge value={section.status} />
          <Badge variant={getGenerationLabel(section) === "AI 真图" ? "success" : "outline"}>
            {getGenerationLabel(section)}
          </Badge>
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="h-4 w-4" />
        </div>
      </button>
    </div>
  );
}

export function PlannerWorkspace({ project }: PlannerWorkspaceProps) {
  const router = useRouter();
  const { openImagePreview } = useImagePreview();
  const initialPlanningTask = getActivePlanningTask(project);
  const initialBulkGenerationTask = getActiveBulkGenerationTask(project);
  const [projectState, setProjectState] = useState(project);
  const [sections, setSections] = useState(project.sections ?? []);
  const [planning, setPlanning] = useState(Boolean(initialPlanningTask));
  const [planningTaskId, setPlanningTaskId] = useState<string | null>(initialPlanningTask?.id ?? null);
  const [cancelingPlanning, setCancelingPlanning] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(Boolean(initialBulkGenerationTask));
  const [bulkTaskId, setBulkTaskId] = useState<string | null>(initialBulkGenerationTask?.id ?? null);
  const [cancelingSectionId, setCancelingSectionId] = useState<string | null>(null);
  const [cancelingBulk, setCancelingBulk] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [regeneratingVisualStyleGuide, setRegeneratingVisualStyleGuide] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig>(getPreviewConfig(project));
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(getGenerationSettings(project));
  const [visualStyleGuide, setVisualStyleGuide] = useState<VisualStyleGuide>(getVisualStyleGuide(project));
  const [bulkProgress, setBulkProgress] = useState<BulkProgressState | null>(
    initialBulkGenerationTask
      ? getBulkProgressFromTask(initialBulkGenerationTask, project.sections?.length ?? 0, true)
      : null,
  );
  const [runningSectionId, setRunningSectionId] = useState<string | null>(null);
  const [planningProgress, setPlanningProgress] = useState<PlanningProgressState>({
    stage: initialPlanningTask ? "requesting" : "idle",
    detail: initialPlanningTask
      ? "检测到刷新前发起的规划任务，AI 正在继续生成头图与详情页结构…"
      : "",
  });
  const generationRequirements = useMemo(() => getGenerationRequirements(projectState), [projectState]);

  const heroSections = useMemo(
    () => sections.filter((section: any) => section.type === "HERO"),
    [sections],
  );
  const detailSections = useMemo(
    () => sections.filter((section: any) => section.type !== "HERO"),
    [sections],
  );
  const generatedCount = useMemo(
    () => sections.filter((section: any) => section.status === "SUCCESS").length,
    [sections],
  );
  const ungeneratedSections = useMemo(
    () => sections.filter((section: any) => !section.currentImageAssetId && !section.imageUrl),
    [sections],
  );

  const hasPlannedSections = sections.length > 0;
  const structureMatchesConfig =
    heroSections.length === previewConfig.heroImageCount &&
    detailSections.length === previewConfig.detailSectionCount;
  const planningSyncedGenerationRequirements = useMemo(
    () => hasSectionsSyncedGenerationRequirements(sections, generationRequirements),
    [generationRequirements, sections],
  );

  const refreshProject = async () => {
    const response = await fetch(`/api/projects/${project.id}`);
    const payload = await response.json();
    if (payload.success) {
      setProjectState(payload.data);
      setSections(payload.data.sections ?? []);
      setPreviewConfig(getPreviewConfig(payload.data));
      setGenerationSettings(getGenerationSettings(payload.data));
      setVisualStyleGuide(getVisualStyleGuide(payload.data));
    }
  };

  useEffect(() => {
    if (!planningTaskId) {
      return;
    }

    let disposed = false;
    let settled = false;

    const pollPlanningTask = async () => {
      if (settled) {
        return;
      }

      try {
        const response = await fetch(`/api/tasks/${planningTaskId}`, { cache: "no-store" });
        const payload = await response.json();
        const task = payload.success ? (payload.data as PlanningTask | null) : null;
        const taskStartedAt = task?.startedAt ? new Date(task.startedAt).getTime() : Number.NaN;
        const taskIsActive =
          task &&
          (task.status === "RUNNING" || task.status === "PENDING") &&
          Number.isFinite(taskStartedAt) &&
          taskStartedAt >= Date.now() - activePlanningTaskMaxAgeMs;

        if (disposed || !task || taskIsActive) {
          return;
        }

        settled = true;
        await refreshProject();
        if (disposed) {
          return;
        }

        setPlanning(false);
        setPlanningTaskId(null);
        setPlanningProgress({ stage: "idle", detail: "" });

        if (task.status === "SUCCESS") {
          toast.success("AI 已完成头图与详情页规划");
        } else if (task.status === "CANCELED") {
          toast.message("已停止 AI 自动规划");
        } else {
          toast.error(
            task.status === "RUNNING" || task.status === "PENDING"
              ? "页面自动规划已超时，可以重新发起规划"
              : task.errorMessage || "页面自动规划失败，请重试",
          );
        }
      } catch {
        // A transient polling failure should not hide a planning task that is still running.
      }
    };

    void pollPlanningTask();
    const timer = window.setInterval(pollPlanningTask, 2000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [planningTaskId]);

  useEffect(() => {
    if (!bulkTaskId) {
      return;
    }

    let disposed = false;
    let settled = false;
    let lastProjectSyncSignature = "";

    const pollBulkGenerationTask = async () => {
      if (settled) {
        return;
      }

      try {
        const response = await fetch(`/api/tasks/${bulkTaskId}`, { cache: "no-store" });
        const payload = await response.json();
        const task = payload.success ? (payload.data as PlanningTask | null) : null;
        if (disposed || !task) {
          return;
        }

        const taskTime = new Date(task.startedAt ?? task.createdAt ?? 0).getTime();
        const taskIsActive =
          (task.status === "RUNNING" || task.status === "PENDING") &&
          Number.isFinite(taskTime) &&
          taskTime >= Date.now() - activeBulkGenerationTaskMaxAgeMs;
        setBulkProgress(getBulkProgressFromTask(task, sections.length, taskIsActive));

        const output = task.outputPayload ?? {};
        const projectSyncSignature = [
          output.currentSectionId ?? "",
          output.completedItems ?? 0,
          output.failedItems ?? 0,
          output.canceledItems ?? 0,
        ].join(":");
        if (taskIsActive && projectSyncSignature !== lastProjectSyncSignature) {
          lastProjectSyncSignature = projectSyncSignature;
          await refreshProject();
          if (disposed) {
            return;
          }
        }

        if (taskIsActive) {
          return;
        }

        settled = true;
        await refreshProject();
        if (disposed) {
          return;
        }

        setBulkGenerating(false);
        setBulkTaskId(null);
        const failedItems = Number(task.outputPayload?.failedItems ?? 0);
        const canceledItems = Number(task.outputPayload?.canceledItems ?? 0);

        if (task.status === "SUCCESS" && failedItems === 0 && canceledItems === 0) {
          toast.success("本轮头图与详情页已完成生成，正在进入预览与编辑");
          router.push(`/projects/${project.id}/editor`);
          router.refresh();
        } else if (task.status === "SUCCESS") {
          toast.warning(
            `批量生成已结束：${failedItems} 个失败，${canceledItems} 个已跳过，请检查后按需重试`,
          );
        } else if (task.status === "CANCELED") {
          toast.message("已终止全部模块图生成");
        } else if (task.status === "RUNNING" || task.status === "PENDING") {
          toast.error("批量生成任务已超时，可以重新发起生成");
        } else {
          toast.error(task.errorMessage || "批量生成失败，请重试");
        }
      } catch {
        // Keep the persisted running state visible while a polling request is temporarily unavailable.
      }
    };

    void pollBulkGenerationTask();
    const timer = window.setInterval(pollBulkGenerationTask, 2000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [bulkTaskId]);

  const saveGenerationSettings = async (options?: { silent?: boolean; generationSettings?: GenerationSettings }) => {
    setSavingConfig(true);

    try {
      const nextGenerationSettings = options?.generationSettings ?? generationSettings;
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelSnapshot: {
            previewConfig,
            generationSettings: nextGenerationSettings,
          },
        }),
      });

      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "项目配置保存失败");
      }

      if (payload.data) {
        setProjectState(payload.data);
        setSections(payload.data.sections ?? []);
        setPreviewConfig(getPreviewConfig(payload.data));
        setGenerationSettings(getGenerationSettings(payload.data));
      setVisualStyleGuide(getVisualStyleGuide(payload.data));
      }

      if (!options?.silent) {
        toast.success("配置已保存");
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "项目配置保存失败");
      }
      throw error;
    } finally {
      setSavingConfig(false);
    }
  };

  const regenerateVisualStyleGuide = async () => {
    setRegeneratingVisualStyleGuide(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/visual-style-guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "统一视觉风格重算失败");
      }

      setVisualStyleGuide(normalizeVisualStyleGuide(payload.data.visualStyleGuide, visualStyleGuide));
      await refreshProject();
      toast.success("已重新生成统一视觉风格");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "统一视觉风格重算失败");
    } finally {
      setRegeneratingVisualStyleGuide(false);
    }
  };
  const autoPlan = async () => {
    setPlanningTaskId(null);
    setPlanning(true);
    setPlanningProgress({
      stage: "requesting",
      detail: "正在读取分析结果、卖点与输出配置，准备发起 AI 自动规划…",
    });

    try {
      const response = await fetch(`/api/projects/${project.id}/plan-sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      setPlanningProgress({
        stage: "parsing",
        detail: "AI 已返回规划结果，正在整理头图与详情页结构…",
      });

      const payload = await response.json();
      if (!payload.success) {
        const rawMessage =
          payload.error?.message ??
          (Array.isArray(payload.error?.details)
            ? JSON.stringify(payload.error.details)
            : "页面自动规划失败");
        throw new Error(rawMessage);
      }

      setPlanningProgress({
        stage: "saving",
        detail: payload.data?.fallbackMode === "template_plan"
          ? "AI 返回结构不完整，已自动切换为模板规划并写入页面结构。"
          : "规划结果已生成，正在写入头图与详情页结构…",
      });

      setSections(payload.data.sections ?? []);
      if (payload.data.previewConfig) {
        setPreviewConfig(payload.data.previewConfig);
      }
      if (payload.data.visualStyleGuide) {
        setVisualStyleGuide(normalizeVisualStyleGuide(payload.data.visualStyleGuide, visualStyleGuide));
      }
      await refreshProject();

      toast.success(
        payload.data?.fallbackMode === "template_plan"
          ? "AI 返回结构不完整，系统已自动切换为模板规划。"
          : "AI 已按分析页保存的输出配置完成头图与详情页规划",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "页面自动规划失败";
      if (!/task canceled|canceled by user/i.test(message)) {
        toast.error(
          /"sections"|expected array|received undefined/i.test(message)
            ? "AI 规划结果格式不完整，请重试；如果仍失败，系统会自动切换为模板规划。"
            : message,
        );
      }
    } finally {
      setPlanning(false);
      setPlanningProgress({
        stage: "idle",
        detail: "",
      });
    }
  };

  const cancelPlanning = async () => {
    setCancelingPlanning(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/cancel-planning`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "停止 AI 自动规划失败");
      }

      setPlanning(false);
      setPlanningTaskId(null);
      setPlanningProgress({ stage: "idle", detail: "" });
      await refreshProject();
      toast.message(payload.data?.canceled ? "已停止 AI 自动规划" : "规划任务已经结束");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停止 AI 自动规划失败");
    } finally {
      setCancelingPlanning(false);
    }
  };

  const saveSection = async (sectionId: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${project.id}/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error?.message ?? "模块保存失败");
    }
  };

  const createSectionByType = async (kind: "hero" | "detail") => {
    const response = await fetch(`/api/projects/${project.id}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: kind === "hero" ? "hero" : "custom",
        title: kind === "hero" ? `新增头图 ${heroSections.length + 1}` : "新增详情页模块",
        goal:
          kind === "hero"
            ? "补充新的头图表达角度，例如主视觉、卖点、场景或信任感。"
            : "补充额外卖点、说明信息或平台适配内容。",
        copy: "",
        visualPrompt:
          kind === "hero"
            ? "Primary Prompt: 生成一张 1:1 电商头图，突出商品主体、清晰标题、核心卖点和轻行动号召，图中文字直接由图像模型生成。\nEnglish Prompt: Create a square e-commerce hero image with strong product focus, clear headline, key selling copy, and a subtle CTA generated directly inside the image."
            : "Primary Prompt: 生成一张电商详情页模块图，突出商品主体、清晰卖点和高级质感，图内直接排版标题、卖点和 CTA。\nEnglish Prompt: Create an e-commerce detail section image with strong product focus, clear selling points, and premium in-image marketing copy plus CTA.",
        editableFields: {},
      }),
    });

    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? (kind === "hero" ? "新增头图失败" : "新增详情页模块失败"));
      return;
    }

    await refreshProject();
    toast.success(kind === "hero" ? "已新增一个头图规划项" : "已新增一个详情页模块");
  };

  const persistGroupedOrder = async (nextHeroSections: any[], nextDetailSections: any[]) => {
    const ordered = [...nextHeroSections, ...nextDetailSections];
    setSections(ordered);

    const response = await fetch(`/api/projects/${project.id}/sections/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderedSectionIds: ordered.map((section: any) => section.id),
      }),
    });

    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "模块排序失败");
      await refreshProject();
      return;
    }

    setSections(payload.data ?? ordered);
  };

  const moveSectionWithinGroup = async (group: "hero" | "detail", sectionId: string, direction: -1 | 1) => {
    const source = group === "hero" ? [...heroSections] : [...detailSections];
    const currentIndex = source.findIndex((section: any) => section.id === sectionId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= source.length) {
      return;
    }

    [source[currentIndex], source[targetIndex]] = [source[targetIndex], source[currentIndex]];
    if (group === "hero") {
      await persistGroupedOrder(source, detailSections);
      return;
    }
    await persistGroupedOrder(heroSections, source);
  };

  const removeDetailSection = async (sectionId: string) => {
    const response = await fetch(`/api/projects/${project.id}/sections/${sectionId}`, {
      method: "DELETE",
    });

    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "删除模块失败");
      return;
    }

    await refreshProject();
    toast.success("详情页模块已删除");
  };

  const removeHeroSection = async (sectionId: string) => {
    const response = await fetch(`/api/projects/${project.id}/sections/${sectionId}`, {
      method: "DELETE",
    });

    const payload = await response.json();
    if (!payload.success) {
      toast.error(payload.error?.message ?? "删除头图失败");
      return;
    }

    await refreshProject();
    toast.success("头图规划项已删除");
  };

  const runSingleGeneration = async (section: any) => {
    setRunningSectionId(section.id);
    setSections((current: any[]) =>
      current.map((entry) => (entry.id === section.id ? { ...entry, status: "GENERATING" } : entry)),
    );
    try {
      const endpoint = section.imageUrl ? "regenerate" : "generate";
      const response = await fetch(`/api/projects/${project.id}/sections/${section.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "模块生成失败");
      }
      await refreshProject();
      toast.success(`${section.type === "HERO" ? "头图" : "详情页"}已生成并自动保存`);
    } catch (error) {
      if (!(error instanceof Error) || !/task canceled/i.test(error.message)) {
        toast.error(error instanceof Error ? error.message : "模块生成失败");
      }
    } finally {
      setRunningSectionId(null);
      await refreshProject();
    }
  };

  const cancelSectionGeneration = async (section: any) => {
    setCancelingSectionId(section.id);
    try {
      const response = await fetch(`/api/projects/${project.id}/sections/${section.id}/cancel-generation`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "终止当前模块图失败");
      }

      setSections((current: any[]) =>
        current.map((entry) =>
          entry.id === section.id
            ? { ...entry, status: entry.imageUrl ? "SUCCESS" : "IDLE" }
            : entry,
        ),
      );
      toast.message(bulkGenerating ? "已终止当前模块图，将继续生成下一张" : "已终止当前模块图生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "终止当前模块图失败");
    } finally {
      setCancelingSectionId(null);
    }
  };

  const cancelAllGeneration = async () => {
    if (!bulkTaskId) return;
    setCancelingBulk(true);
    try {
      const response = await fetch(`/api/tasks/${bulkTaskId}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(payload.error?.message ?? "终止全部生成失败");
      }
      toast.message("正在终止全部模块图生成…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "终止全部生成失败");
    } finally {
      setCancelingBulk(false);
    }
  };

  const generateAllSections = async (mode: "all" | "missing") => {
    if (!sections.length) {
      toast.error("请先完成页面规划，再开始批量生成");
      return;
    }
    const generationQueue = mode === "missing" ? ungeneratedSections : sections;
    if (generationQueue.length === 0) {
      toast.message("当前规划没有未生成的模块图");
      return;
    }

    setBulkGenerating(true);
    setBulkProgress({
      total: generationQueue.length,
      completed: 0,
      failed: 0,
      canceled: 0,
      fallbackCount: 0,
      currentTitle: generationQueue[0]?.title ?? null,
      currentSectionId: generationQueue[0]?.id ?? null,
      mode,
      running: true,
    });

    try {
      const response = await fetch(`/api/projects/${project.id}/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json();
      if (!payload.success || !payload.data?.id) {
        throw new Error(payload.error?.message ?? "批量生成任务启动失败");
      }

      const task = payload.data as PlanningTask;
      setBulkTaskId(task.id);
      setBulkProgress(getBulkProgressFromTask(task, generationQueue.length, true));
    } catch (error) {
      setBulkGenerating(false);
      setBulkProgress((current) => (current ? { ...current, running: false } : current));
      toast.error(error instanceof Error ? error.message : "批量生成任务启动失败");
    }
  };

  const bulkPercent = progressPercent(bulkProgress);
  const isSectionGenerating = (section: any) =>
    section.status === "GENERATING" ||
    runningSectionId === section.id ||
    (bulkGenerating && bulkProgress?.currentSectionId === section.id);
  const getSectionDisplayStatus = (section: any) =>
    isSectionGenerating(section) ? "GENERATING" : section.status;

  return (
    <div className="space-y-6">
      <ProjectOutputConfigCard project={projectState} />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>统一视觉风格</CardTitle>
              <CardDescription>
                由 Agent 根据商品分析和主商品图自动决策，后续头图、详情页、重绘和翻译都会沿用这套视觉系统。
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={regenerateVisualStyleGuide}
              disabled={regeneratingVisualStyleGuide || planning || bulkGenerating}
            >
              {regeneratingVisualStyleGuide ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {regeneratingVisualStyleGuide ? "重算中..." : "AI 重新生成统一风格"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NoticeCard
            variant="info"
            title="生成时会自动遵循统一风格"
            description="用户无需手动填写每张图的风格。Agent 会控制色彩、背景、光影、字体、CTA、商品结构和负面约束，保证整套详情页一致。"
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">风格名称</p>
              <p className="mt-2 text-sm font-medium">{visualStyleGuide.styleName}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4 md:col-span-2">
              <p className="text-xs text-muted-foreground">色彩与背景</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6">{visualStyleGuide.colorPalette} {visualStyleGuide.backgroundSystem}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">光影与镜头</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6">{visualStyleGuide.lighting} {visualStyleGuide.cameraLanguage}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">商品表现</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6">{visualStyleGuide.productRenderingRules}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">负面约束</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6">{visualStyleGuide.negativeStyleConstraints}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>页面规划与生成</CardTitle>
          <CardDescription>规划页会按照最终产出结构拆分为头图、详情页和页面壳层，避免新增模块与最终导出结构不一致。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-border bg-muted/40 p-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">第 1 步：检查分析页已保存的输出配置</p>
                  <p className="text-xs leading-6 text-muted-foreground">
                    语言、头图张数、详情页张数和详情图比例统一在分析页维护。这里直接沿用分析页保存的配置。
                  </p>
                </div>

                <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline">内容语言：{contentLanguageLabels[previewConfig.contentLanguage]}</Badge>
                    <Badge variant="outline">头图目标：{previewConfig.heroImageCount} 张</Badge>
                    <Badge variant="outline">详情页目标：{previewConfig.detailSectionCount} 张</Badge>
                    <Badge variant="outline">详情图比例：{previewConfig.imageAspectRatio}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant={heroSections.length === previewConfig.heroImageCount ? "success" : "outline"}>
                      当前头图结构：{heroSections.length} 张
                    </Badge>
                    <Badge variant={detailSections.length === previewConfig.detailSectionCount ? "success" : "outline"}>
                      当前详情页结构：{detailSections.length} 张
                    </Badge>
                  </div>
                  {!structureMatchesConfig ? (
                    <>
                    <NoticeCard
                      variant="warning"
                      title="当前结构与分析页配置不一致"
                      description="请运行下方的 AI 自动规划，让系统按分析页保存的数量与比例重新整理头图和详情页结构。"
                    />
                    <div className="hidden">
                      当前结构与分析页配置不一致，请运行下方的 AI 自动规划同步结构。
                    </div>
                    </>
                  ) : null}
                  {generationRequirements && !planningSyncedGenerationRequirements ? (
                    <NoticeCard
                      variant="warning"
                      title="生图补充要求尚未同步到当前规划"
                      description="分析页已保存多角度、多场景等生图要求，但当前模块规划仍是旧版本。请点击下方 AI 自动规划，让系统重新拆分头图和详情页后再生成图片。"
                    />
                  ) : null}
                  <Link
                    href={`/projects/${project.id}/analysis`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-muted hover:text-slate-900 dark:border-white/10 dark:bg-[#141416] dark:text-slate-100 dark:hover:border-white/20 dark:hover:bg-white/8 dark:hover:text-white"
                  >
                    返回分析页调整配置
                  </Link>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3">
                  <input
                    type="checkbox"
                    checked={generationSettings.allowSvgFallback}
                    onChange={(event) =>
                      setGenerationSettings((current) => ({
                        ...current,
                        allowSvgFallback: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-input"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">允许 SVG 兜底预览</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      默认关闭。关闭后系统只接受真实 AI 图像生成；如果当前 Provider 没有可用图片端点，会直接提示失败原因。
                    </p>
                  </div>
                </label>

                <Button variant="outline" onClick={() => saveGenerationSettings()} disabled={savingConfig || bulkGenerating}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingConfig ? "保存中..." : "保存生成设置"}
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-muted/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">第 2 步：AI 自动规划</p>
                  <p className="text-xs leading-6 text-muted-foreground">
                    AI 会直接输出独立的头图规划项和详情页规划项，头图永远排在前面，页面壳层不进入可规划模块。你手动新增、删除或改类型后，数量会自动回写并与分析页配置保持同步。
                  </p>
                </div>
                {planning ? (
                  <Button
                    variant="destructive"
                    onClick={cancelPlanning}
                    disabled={cancelingPlanning}
                    className="h-10 shrink-0 whitespace-nowrap px-5 text-sm md:min-w-[240px]"
                  >
                    {cancelingPlanning ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="mr-2 h-4 w-4" />
                    )}
                    {cancelingPlanning ? "正在停止规划…" : "停止 AI 自动规划"}
                  </Button>
                ) : (
                  <Button
                    onClick={autoPlan}
                    disabled={bulkGenerating}
                    className="h-10 shrink-0 whitespace-nowrap px-5 text-sm md:min-w-[240px]"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {hasPlannedSections ? "重新规划头图与详情页" : "AI 自动规划"}
                  </Button>
                )}
              </div>

              {planning ? (
                <>
                <NoticeCard
                  variant="info"
                  title="正在执行页面自动规划"
                  description={planningProgress.detail || "AI 正在生成头图与详情页的结构方案，请稍候。"}
                />
                <div className="hidden">
                  <div className="flex items-start gap-3">
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">正在执行页面自动规划</p>
                      <p className="text-xs leading-6 text-muted-foreground">
                        {planningProgress.detail || "AI 正在生成头图与详情页的结构方案，请稍候…"}
                      </p>
                    </div>
                  </div>
                </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-sky-200 bg-sky-50/85 p-5 text-slate-900 dark:border-white/10 dark:bg-[#0f1012] dark:text-slate-100">
            <p className="text-sm font-semibold">第 3 步：一键生成并进入编辑台</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              当前已规划 <span className="font-semibold text-slate-950 dark:text-white">{heroSections.length}</span> 张头图、<span className="font-semibold text-slate-950 dark:text-white">{detailSections.length}</span> 张详情页，已生成 <span className="font-semibold text-slate-950 dark:text-white">{generatedCount}</span> 个模块图。
            </p>
            <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-slate-400">
              一键生成会按当前规划结构逐个请求真实 AI 出图，并统一遵循上方视觉风格规范。头图固定按 1:1 生成，详情页按分析页保存的比例生成；页面壳层不参与出图。
            </p>

            {bulkProgress ? (
              <div className="mt-5 space-y-3 rounded-2xl border border-sky-200 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                  <span>生成进度</span>
                  <span>{bulkPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-sky-500 transition-all dark:bg-sky-400" style={{ width: `${bulkPercent}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <p>成功：{bulkProgress.completed}</p>
                  <p>失败：{bulkProgress.failed}</p>
                  <p>已跳过：{bulkProgress.canceled}</p>
                  <p>SVG 兜底：{bulkProgress.fallbackCount}</p>
                  <p>总数：{bulkProgress.total}</p>
                </div>
                <p className="text-xs leading-6 text-slate-600 dark:text-slate-400">
                  {bulkProgress.running
                    ? `当前正在处理：${bulkProgress.currentTitle ?? "准备中"}`
                    : bulkProgress.failed > 0
                      ? "本轮生成已结束，存在失败模块，请先查看原因再决定是否重试。"
                      : bulkProgress.canceled > 0
                        ? "本轮生成已结束，存在主动跳过的模块，可以单独重新生成。"
                      : "本轮生成已结束，可以进入预览与编辑继续细调。"}
                </p>
                {bulkProgress.running && bulkTaskId ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelAllGeneration}
                    disabled={cancelingBulk}
                  >
                    {cancelingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                    {cancelingBulk ? "正在终止…" : "终止全部生成"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => generateAllSections("missing")}
                disabled={
                  planning ||
                  bulkGenerating ||
                  runningSectionId !== null ||
                  !hasPlannedSections ||
                  ungeneratedSections.length === 0
                }
              >
                {bulkGenerating && bulkProgress?.mode === "missing" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-2 h-4 w-4" />
                )}
                {bulkGenerating && bulkProgress?.mode === "missing"
                  ? "正在生成未生成模块…"
                  : `一键生成未生成模块图${ungeneratedSections.length > 0 ? `（${ungeneratedSections.length}）` : ""}`}
              </Button>
              <Button
                onClick={() => generateAllSections("all")}
                disabled={planning || bulkGenerating || runningSectionId !== null || !hasPlannedSections}
                variant="secondary"
                className="dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
                {bulkGenerating && bulkProgress?.mode === "all" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Images className="mr-2 h-4 w-4" />
                )}
                {bulkGenerating && bulkProgress?.mode === "all" ? "正在重新生成全部模块…" : "重新生成全部模块图"}
              </Button>
              <Link
                href={`/projects/${project.id}/editor`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.1] dark:hover:text-white"
              >
                直接进入预览与编辑
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>头图规划</CardTitle>
                <CardDescription>每张头图都是独立规划项，固定 1:1，最终会直接进入头图轮播。这里建议只保留最核心的首屏表达角度。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">当前 {heroSections.length} 张</Badge>
                <Button variant="outline" onClick={() => createSectionByType("hero")}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增头图
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {heroSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                还没有头图规划项。点击上方“AI 自动规划”后，会按分析页配置直接生成对应数量的头图规划卡片。
              </div>
            ) : (
              heroSections.map((section: any, index: number) => (
                <Card key={section.id} className="rounded-2xl border-border/80 shadow-sm">
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">头图 {index + 1}</CardTitle>
                        <CardDescription>{section.sectionKey}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">1:1 头图</Badge>
                        <StatusBadge value={getSectionDisplayStatus(section)} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={getPlannerCardContentClass(section)}>
                    <CompletedSectionPreview section={section} aspectRatio="1:1" onPreview={openImagePreview} />
                    <div className="space-y-3">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>模块类型</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
                            value={String(section.type).toLowerCase()}
                            onChange={(event) =>
                              setSections((current: any[]) =>
                                current.map((item) => (item.id === section.id ? { ...item, type: event.target.value.toUpperCase() } : item)),
                              )
                            }
                          >
                            {plannerSectionTypeOptions.map((type) => (
                              <option key={type} value={type}>
                                {sectionTypeLabels[type]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>头图标题</Label>
                          <Input
                            className="h-9 rounded-lg"
                            value={section.title}
                            onChange={(event) =>
                              setSections((current: any[]) =>
                                current.map((item) => (item.id === section.id ? { ...item, title: event.target.value } : item)),
                              )
                            }
                          />
                        </div>
                      </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <Label>头图目标</Label>
                        <Input
                          className="h-9 rounded-lg"
                          value={section.goal}
                          onChange={(event) =>
                            setSections((current: any[]) =>
                              current.map((item) => (item.id === section.id ? { ...item, goal: event.target.value } : item)),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>头图文案</Label>
                        <Textarea
                          className="min-h-[72px] rounded-lg"
                          value={section.copy}
                          onChange={(event) =>
                            setSections((current: any[]) =>
                              current.map((item) => (item.id === section.id ? { ...item, copy: event.target.value } : item)),
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>双语视觉 Prompt</Label>
                      <Textarea
                        className="max-h-[140px] min-h-[84px] rounded-lg"
                        value={section.visualPrompt}
                        onChange={(event) =>
                          setSections((current: any[]) =>
                            current.map((item) =>
                              item.id === section.id ? { ...item, visualPrompt: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => moveSectionWithinGroup("hero", section.id, -1)} disabled={index === 0}>
                        <ArrowUp className="mr-1 h-4 w-4" />
                        上移
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveSectionWithinGroup("hero", section.id, 1)}
                        disabled={index === heroSections.length - 1}
                      >
                        <ArrowDown className="mr-1 h-4 w-4" />
                        下移
                      </Button>
                      {isSectionGenerating(section) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelSectionGeneration(section)}
                          disabled={cancelingSectionId === section.id}
                        >
                          {cancelingSectionId === section.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="mr-1 h-4 w-4" />
                          )}
                          {cancelingSectionId === section.id ? "正在终止…" : "终止当前头图"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runSingleGeneration(section)}
                          disabled={bulkGenerating}
                        >
                          <ImagePlus className="mr-1 h-4 w-4" />
                          {section.imageUrl ? "重生成当前头图" : "生成当前头图"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await saveSection(section.id, {
                              type: String(section.type).toLowerCase(),
                              title: section.title,
                              goal: section.goal,
                              copy: section.copy,
                              visualPrompt: section.visualPrompt,
                              editableData: section.editableData ?? {},
                            });
                            await refreshProject();
                            toast.success(String(section.type).toLowerCase() === "hero" ? "头图规划已保存" : "模块类型已切换并保存");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "模块保存失败");
                          }
                        }}
                      >
                        <Save className="mr-1 h-4 w-4" />
                        保存
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeHeroSection(section.id)}>
                        <Trash2 className="mr-1 h-4 w-4 text-rose-500" />
                        删除
                      </Button>
                      <Badge variant={getGenerationLabel(section) === "AI 真图" ? "success" : "outline"}>{getGenerationLabel(section)}</Badge>
                    </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>详情页规划</CardTitle>
                <CardDescription>详情页模块会按最终长页顺序导出。这里适合补充卖点、场景、参数、工艺、对比和总结等内容。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => createSectionByType("detail")}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增详情页模块
                </Button>
                <Badge variant="outline">当前 {detailSections.length} 张</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {detailSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                还没有详情页规划项。点击上方“AI 自动规划”后，会自动按分析页配置生成详情页模块。
              </div>
            ) : (
              detailSections.map((section: any, index: number) => (
                <Card key={section.id} className="rounded-2xl border-border/80 shadow-sm">
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">详情页 {index + 1}</CardTitle>
                        <CardDescription>{section.sectionKey}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{previewConfig.imageAspectRatio} 详情页</Badge>
                        <StatusBadge value={getSectionDisplayStatus(section)} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={getPlannerCardContentClass(section)}>
                    <CompletedSectionPreview
                      section={section}
                      aspectRatio={previewConfig.imageAspectRatio}
                      onPreview={openImagePreview}
                    />
                    <div className="space-y-3">
                      <div className="grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <Label>模块类型</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm dark:bg-black/30 dark:text-slate-100"
                            value={String(section.type).toLowerCase()}
                            onChange={(event) => {
                              const value = event.target.value;
                              setSections((current: any[]) =>
                                current.map((item) => (item.id === section.id ? { ...item, type: value.toUpperCase() } : item)),
                              );
                            }}
                          >
                            {plannerSectionTypeOptions.map((type) => (
                              <option key={type} value={type}>
                                {sectionTypeLabels[type]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>模块标题</Label>
                          <Input
                            className="h-9 rounded-lg"
                            value={section.title}
                            onChange={(event) =>
                              setSections((current: any[]) =>
                                current.map((item) => (item.id === section.id ? { ...item, title: event.target.value } : item)),
                              )
                            }
                          />
                        </div>
                      </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <Label>模块目标</Label>
                        <Input
                          className="h-9 rounded-lg"
                          value={section.goal}
                          onChange={(event) =>
                            setSections((current: any[]) =>
                              current.map((item) => (item.id === section.id ? { ...item, goal: event.target.value } : item)),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>模块文案</Label>
                        <Textarea
                          className="min-h-[72px] rounded-lg"
                          value={section.copy}
                          onChange={(event) =>
                            setSections((current: any[]) =>
                              current.map((item) => (item.id === section.id ? { ...item, copy: event.target.value } : item)),
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>双语视觉 Prompt</Label>
                      <Textarea
                        className="max-h-[140px] min-h-[84px] rounded-lg"
                        value={section.visualPrompt}
                        onChange={(event) =>
                          setSections((current: any[]) =>
                            current.map((item) =>
                              item.id === section.id ? { ...item, visualPrompt: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => moveSectionWithinGroup("detail", section.id, -1)} disabled={index === 0}>
                        <ArrowUp className="mr-1 h-4 w-4" />
                        上移
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveSectionWithinGroup("detail", section.id, 1)}
                        disabled={index === detailSections.length - 1}
                      >
                        <ArrowDown className="mr-1 h-4 w-4" />
                        下移
                      </Button>
                      {isSectionGenerating(section) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelSectionGeneration(section)}
                          disabled={cancelingSectionId === section.id}
                        >
                          {cancelingSectionId === section.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="mr-1 h-4 w-4" />
                          )}
                          {cancelingSectionId === section.id ? "正在终止…" : "终止当前详情页"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runSingleGeneration(section)}
                          disabled={bulkGenerating}
                        >
                          <ImagePlus className="mr-1 h-4 w-4" />
                          {section.imageUrl ? "重生成当前详情页" : "生成当前详情页"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await saveSection(section.id, {
                              type: String(section.type).toLowerCase(),
                              title: section.title,
                              goal: section.goal,
                              copy: section.copy,
                              visualPrompt: section.visualPrompt,
                              editableData: section.editableData ?? {},
                            });
                            await refreshProject();
                            toast.success(String(section.type).toLowerCase() === "hero" ? "模块已切换为头图并保存" : "当前详情页规划已保存");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "模块保存失败");
                          }
                        }}
                      >
                        <Save className="mr-1 h-4 w-4" />
                        保存
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeDetailSection(section.id)}>
                        <Trash2 className="mr-1 h-4 w-4 text-rose-500" />
                        删除
                      </Button>
                      <Badge variant={getGenerationLabel(section) === "AI 真图" ? "success" : "outline"}>{getGenerationLabel(section)}</Badge>
                    </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>页面壳层说明</CardTitle>
                <CardDescription>这些内容会出现在最终预览页中，但不进入 AI 可规划模块，也不会导出为单独图片。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {shellItems.map((item) => (
                <div key={item.title} className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 dark:border-white/10 dark:bg-black/30">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/8 dark:shadow-none">
                      <Info className="h-4 w-4 text-sky-600" />
                    </div>
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        {item.title}
                      </p>
                      <p className="text-xs leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
