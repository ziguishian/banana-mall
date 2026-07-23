import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";

import { buildSectionPlanningPrompt, buildVisualStyleGuidePrompt } from "@/lib/ai/prompts";
import { sectionPlanOutputSchema, visualStyleGuideSchema } from "@/lib/ai/schemas/section-plan";
import { prisma } from "@/lib/db/prisma";
import { readStorageFile } from "@/lib/storage/asset-manager";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { completeTask, createTask, failTask, findRecentRunningTask } from "@/lib/services/task-service";
import { contentLanguageOptions, normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";
import { buildDefaultVisualStyleGuide, hasVisualStyleGuide, normalizeVisualStyleGuide, readVisualStyleGuide } from "@/lib/utils/visual-style-guide";
import type { SectionTypeKey } from "@/types/domain";

type PreviewConfigInput = {
  heroImageCount: number;
  detailSectionCount: number;
  imageAspectRatio: "3:4" | "9:16";
  contentLanguage: ContentLanguage;
};

type RawPlannedSection = {
  id: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableFields: Record<string, unknown>;
};

type NormalizedSection = {
  sectionKey: string;
  type: string;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableData: Record<string, unknown>;
  order: number;
};

const previewConfigSchema = z.object({
  heroImageCount: z.number().int().min(1).max(5),
  detailSectionCount: z.number().int().min(1).max(10),
  imageAspectRatio: z.enum(["3:4", "9:16"]).default("9:16"),
  contentLanguage: z.enum(contentLanguageOptions).default("zh-CN"),
});

const previewDecisionSchema = z.object({
  heroImageCount: z.number().int().min(1).max(5),
  detailSectionCount: z.number().int().min(1).max(10),
  reason: z.string().default(""),
});

const heroFallbackSections: Array<{
  id: string;
  type: SectionTypeKey;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableFields: Record<string, unknown>;
}> = [
  {
    id: "hero_01",
    type: "hero",
    title: "第一屏主视觉",
    goal: "快速建立商品记忆点，突出第一眼吸引力。",
    copy: "用一张完成度很高的主视觉图，把商品核心价值和气质一次讲清楚。",
    visualPrompt:
      "中文提示：1:1 电商首张主视觉，商品以 3/4 角度居中偏下，占画面 55%-65%，浅色高级背景，左上保留大标题区，右侧用 2-3 个短卖点标签围绕真实结构标注。必须保持商品真实几何、开口/线缆/风口/按钮方向正确，不出现悬浮、反向风、线缆插入桌面等不合理物理现象。\nEnglish Prompt: Square e-commerce primary hero image, product in a three-quarter view centered slightly lower, occupying 55-65% of the canvas, premium light background, large headline area at top-left, 2-3 selling point tags around real product structures. Preserve real product geometry and avoid impossible physics such as floating, reversed airflow, or cables merging into surfaces.",
    editableFields: {
      tone: "高级质感",
      compositionHint: "居中构图",
    },
  },
  {
    id: "hero_02",
    type: "hero",
    title: "核心卖点头图",
    goal: "用一张强转化头图把最值得买的理由直接讲透。",
    copy: "把商品最强卖点直接做进画面标题和图内短句里，让用户第一时间知道为什么值得买。",
    visualPrompt:
      "中文提示：1:1 核心卖点头图，画面采用近景产品 + 功能分解标注，商品主体放在右侧或中间，左侧放强转化标题、3 个短卖点和 CTA。镜头要明确展示最关键功能部位，例如喷口/开口/抽屉/按键/材质接缝；所有标注线必须指向真实部件。禁止出现结构错位、功能方向反转、线缆断裂或穿进桌面。\nEnglish Prompt: Square selling-point hero image with close product view and functional annotations. Place product at center or right, strong conversion headline, three short selling points, and CTA on the left. Clearly show the key functional part such as nozzle, opening, drawer, button, or material seam. Annotation lines must point to real parts; avoid misaligned structure, reversed function direction, broken cables, or cables entering furniture.",
    editableFields: {
      tone: "转化导向",
      compositionHint: "主体 + 卖点文案同屏",
    },
  },
  {
    id: "hero_03",
    type: "hero",
    title: "场景氛围头图",
    goal: "让用户快速代入使用场景和生活方式气质。",
    copy: "通过场景化构图和图内标题文案，让商品与生活方式、使用时刻建立直接关联。",
    visualPrompt:
      "中文提示：1:1 场景氛围头图，把商品放入真实使用场景，采用中景构图，周围只放 2-4 个相关道具来说明使用时刻，背景有生活方式氛围但不能抢主体。图内标题放在上方留白，场景价值短句放在底部半透明信息条。商品必须有合理支撑、阴影和使用方向；如果是电器，线缆和风/光/热方向必须符合真实工作逻辑。\nEnglish Prompt: Square lifestyle hero image showing the product in a real usage scene with medium shot composition and 2-4 relevant props. Background should add lifestyle mood without stealing focus. Place headline in upper whitespace and scene-value copy in a subtle bottom information bar. Product must have realistic support, shadows, and use direction; for appliances, cable and airflow/light/heat direction must follow real mechanics.",
    editableFields: {
      tone: "氛围感",
      compositionHint: "场景化构图",
    },
  },
  {
    id: "hero_04",
    type: "hero",
    title: "细节信任头图",
    goal: "用品质、工艺或材质细节建立第一屏信任感。",
    copy: "通过近景细节和简洁文案，让用户第一眼感知品质感、工艺感和完成度。",
    visualPrompt:
      "中文提示：电商头图，强调品质细节、材质或工艺，画面高级克制，图内直接排版中文品质标题和信任感短句，适合 1:1 头图轮播。\nEnglish Prompt: Square e-commerce hero image focused on craftsmanship and material trust, with elegant composition and Chinese quality-driven copy integrated into the image.",
    editableFields: {
      tone: "品质背书",
      compositionHint: "细节近景",
    },
  },
  {
    id: "hero_05",
    type: "hero",
    title: "差异化亮点头图",
    goal: "突出相对竞品或常规选择的差异化优势。",
    copy: "围绕核心差异化特点，用更直接的对比式表达完成最后一张头图收口。",
    visualPrompt:
      "中文提示：电商头图，突出差异化优势和购买理由，图内直接排版中文对比式标题、优势短句和行动号召，适合 1:1 头图轮播。\nEnglish Prompt: Square e-commerce hero image emphasizing differentiation and buying reasons, with Chinese comparison-style headline, advantage copy, and CTA built directly into the image.",
    editableFields: {
      tone: "差异化强调",
      compositionHint: "对比式信息布局",
    },
  },
];

const detailFallbackSections: Array<{
  id: string;
  type: SectionTypeKey;
  title: string;
  goal: string;
  copy: string;
  visualPrompt: string;
  editableFields: Record<string, unknown>;
}> = [
  {
    id: "selling_points_01",
    type: "selling_points",
    title: "核心卖点速览",
    goal: "让用户快速理解最值得购买的理由。",
    copy: "用图内标题、卖点短句和对比式信息，把购买理由在一屏内讲清楚。",
    visualPrompt:
      "中文提示：电商卖点模块，商品清晰展示，图内直接排版中文卖点标题、短句与功能标签，整体干净有转化感。\nEnglish Prompt: Conversion-focused selling-points section with the product clearly shown and Chinese selling-point copy designed directly inside the image.",
    editableFields: {
      sellingPoints: [],
      tone: "转化导向",
      compositionHint: "卖点信息分区排版",
    },
  },
  {
    id: "detail_closeup_01",
    type: "detail_closeup",
    title: "细节特写",
    goal: "强化材质、工艺与真实质感。",
    copy: "通过近景放大，把材质、边缘和工艺细节讲透。",
    visualPrompt:
      "中文提示：电商细节特写图，突出纹理、边缘、表面光泽与做工，并在图内加入中文短标题和工艺说明。\nEnglish Prompt: Detailed close-up e-commerce image highlighting texture, finish, edges, and craftsmanship, with concise Chinese copy integrated into the composition.",
    editableFields: {
      tone: "细节说明",
      compositionHint: "近景微距",
    },
  },
  {
    id: "scenario_01",
    type: "scenario",
    title: "场景使用展示",
    goal: "让用户更容易代入真实使用场景。",
    copy: "把商品放进真实场景里，提升想象空间和购买欲望。",
    visualPrompt:
      "中文提示：生活方式场景图，商品仍为主角，图内直接排版中文场景标题和使用价值文案，整体自然有氛围。\nEnglish Prompt: Lifestyle usage scene with the product as the focal point, featuring integrated Chinese copy about the usage scenario and emotional value.",
    editableFields: {
      tone: "生活方式",
      compositionHint: "场景化展示",
    },
  },
  {
    id: "specs_01",
    type: "specs",
    title: "规格信息说明",
    goal: "把参数、尺寸和适配信息讲清楚。",
    copy: "通过结构化图文版式，让规格信息一眼看懂。",
    visualPrompt:
      "中文提示：规格参数型详情图，商品搭配尺寸线、参数表和中文说明排版，信息清晰整洁，适合移动端浏览。\nEnglish Prompt: Specification-focused detail image combining the product with dimensions, parameter layout, and Chinese explanatory copy designed directly in-image.",
    editableFields: {
      tone: "专业说明",
      compositionHint: "参数表格式",
    },
  },
  {
    id: "material_01",
    type: "material",
    title: "材质工艺说明",
    goal: "补充专业感与品质背书。",
    copy: "把用户不容易从外观看懂的材质和工艺价值解释清楚。",
    visualPrompt:
      "中文提示：材质工艺详情图，突出材质纹理、工艺结构和品质细节，图内加入中文短标题和价值说明。\nEnglish Prompt: Material and craftsmanship detail image that emphasizes texture and premium construction, with Chinese value statements integrated into the image.",
    editableFields: {
      tone: "专业背书",
      compositionHint: "结构与纹理并重",
    },
  },
  {
    id: "comparison_01",
    type: "comparison",
    title: "差异化对比",
    goal: "清楚说明为什么值得选这款商品。",
    copy: "用优势对比和价值提炼，帮助用户更快完成决策。",
    visualPrompt:
      "中文提示：对比说明型详情图，突出本品优势、差异点和购买理由，图内直接设计中文标题和对比信息模块。\nEnglish Prompt: Comparison-style detail page image emphasizing advantages, differentiation, and buying reasons, with Chinese comparison copy embedded inside the image.",
    editableFields: {
      tone: "价值对比",
      compositionHint: "左右或上下对比版式",
    },
  },
  {
    id: "brand_trust_01",
    type: "brand_trust",
    title: "品牌与信任背书",
    goal: "提升品牌感和成交信任感。",
    copy: "通过品牌理念、工艺标准或服务承诺，增加下单安心感。",
    visualPrompt:
      "中文提示：品牌背书型详情图，图内加入品牌理念、工艺标准或服务承诺等中文信息，整体克制专业。\nEnglish Prompt: Brand trust section image with Chinese copy about brand values, quality assurance, or service promise built directly into the image.",
    editableFields: {
      tone: "信任建立",
      compositionHint: "品牌叙事排版",
    },
  },
  {
    id: "summary_01",
    type: "summary",
    title: "购买理由总结",
    goal: "形成最后一轮转化推动。",
    copy: "通过总结式收口，帮助用户更快完成购买决策。",
    visualPrompt:
      "中文提示：总结收口型详情图，商品主体清晰，图内直接放入中文总结标题、购买理由和行动号召。\nEnglish Prompt: Conversion-closing summary image with strong product focus and Chinese summary copy plus CTA integrated directly into the visual.",
    editableFields: {
      tone: "收口转化",
      compositionHint: "稳定收束",
    },
  },
];

const sectionTypeMap: Record<string, string> = {
  hero: "HERO",
  selling_points: "SELLING_POINTS",
  scenario: "SCENARIO",
  detail_closeup: "DETAIL_CLOSEUP",
  specs: "SPECS",
  material: "MATERIAL",
  comparison: "COMPARISON",
  gift_scene: "GIFT_SCENE",
  brand_trust: "BRAND_TRUST",
  summary: "SUMMARY",
  custom: "CUSTOM",
};

function normalizeSectionType(type: string) {
  const normalized = type.trim().toLowerCase();
  return sectionTypeMap[normalized] ?? "CUSTOM";
}

function ensureBilingualPrompt(prompt: string, sectionTitle: string) {
  const trimmed = prompt.trim();
  if (
    trimmed.includes("English Prompt:") &&
    (trimmed.includes("中文提示：") || trimmed.includes("Primary Prompt:"))
  ) {
    return trimmed;
  }

  const primaryPrompt =
    trimmed || `${sectionTitle}，突出商品主体、商业排版和图内卖点信息，适合移动端电商详情页。`;
  return `Primary Prompt: ${primaryPrompt}\nEnglish Prompt: A premium e-commerce section visual for ${sectionTitle}, with the marketing copy designed directly inside the image and a strong conversion-focused composition.`;
}

function normalizeEditableFields(value: unknown): Record<string, unknown> {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    ...raw,
    styleRole: typeof raw.styleRole === "string" ? raw.styleRole : "Follow the project-level visual style guide while serving this section goal.",
    sharedStyleAnchors: Array.isArray(raw.sharedStyleAnchors)
      ? raw.sharedStyleAnchors
      : ["consistent color palette", "consistent background system", "consistent lighting direction", "consistent typography and CTA style", "accurate product proportions and materials"],
    localVariation: typeof raw.localVariation === "string" ? raw.localVariation : "Only vary the section-specific selling point, composition angle, and information hierarchy.",
  };
}

type PlanningAsset = {
  filePath: string;
  mimeType?: string | null;
  type: string;
  isMain: boolean;
  sortOrder: number;
};

function pickPlanningReferenceAssets(assets: PlanningAsset[]) {
  const ranked = [...assets]
    .filter((asset) => ["MAIN", "ANGLE", "DETAIL", "REFERENCE"].includes(asset.type))
    .sort((a, b) => {
      const score = (asset: PlanningAsset) => {
        if (asset.isMain) return 0;
        if (asset.type === "MAIN") return 1;
        if (asset.type === "ANGLE") return 2;
        if (asset.type === "DETAIL") return 3;
        return 4;
      };
      return score(a) - score(b) || a.sortOrder - b.sortOrder;
    });

  return ranked.slice(0, 3);
}

async function assetToPlanningDataUrl(asset: Pick<PlanningAsset, "filePath" | "mimeType">) {
  const buffer = await readStorageFile(asset.filePath);
  const mimeType = asset.mimeType ?? "image/png";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function collectPlanningReferenceImages(assets: PlanningAsset[]) {
  const selectedAssets = pickPlanningReferenceAssets(assets);
  return Promise.all(selectedAssets.map((asset) => assetToPlanningDataUrl(asset)));
}

function readPreviewConfig(snapshot: unknown): PreviewConfigInput {
  const raw = ((snapshot as Record<string, unknown> | null) ?? {}).previewConfig;
  return previewConfigSchema.parse({
    heroImageCount: Number((raw as Record<string, unknown> | null)?.heroImageCount ?? 4),
    detailSectionCount: Number((raw as Record<string, unknown> | null)?.detailSectionCount ?? 6),
    imageAspectRatio: ((raw as Record<string, unknown> | null)?.imageAspectRatio ?? "9:16") as "3:4" | "9:16",
    contentLanguage: normalizeContentLanguage((raw as Record<string, unknown> | null)?.contentLanguage),
  });
}

function buildProjectVisualStyleGuideFallback(project: { style: string; platform: string; analysis?: { normalizedResult: unknown } | null }) {
  const analysis = (project.analysis?.normalizedResult as Record<string, unknown> | null) ?? {};
  return buildDefaultVisualStyleGuide({
    productName: typeof analysis.productName === "string" ? analysis.productName : undefined,
    styleLabel: project.style,
    platformLabel: project.platform,
  });
}

function resolvePlanningVisualStyleGuide(project: { modelSnapshot: unknown; style: string; platform: string; analysis?: { normalizedResult: unknown } | null }, plannedGuide?: unknown) {
  const fallback = buildProjectVisualStyleGuideFallback(project);
  const existingGuide = readVisualStyleGuide(project.modelSnapshot, fallback);
  if (existingGuide) return existingGuide;
  if (hasVisualStyleGuide(plannedGuide)) return normalizeVisualStyleGuide(plannedGuide, fallback);
  return fallback;
}

type PlanningModelRecord = {
  modelId: string;
  capabilities: unknown;
  isDefaultPlanning?: boolean;
  isDefaultAnalysis?: boolean;
};

function readModelCapabilities(model: PlanningModelRecord) {
  return (model.capabilities as Record<string, boolean> | null) ?? {};
}

function isVisionTextModel(model: PlanningModelRecord) {
  const capabilities = readModelCapabilities(model);
  return Boolean(capabilities.text && capabilities.vision);
}

function pickMultimodalPlanningModel(models: PlanningModelRecord[], preferredModelId?: string | null) {
  if (preferredModelId) return preferredModelId;

  const visionTextModels = models.filter(isVisionTextModel);
  return (
    visionTextModels.find((item) => item.isDefaultPlanning)?.modelId ??
    visionTextModels.find((item) => item.isDefaultAnalysis)?.modelId ??
    visionTextModels.find((item) => /gpt-4o|gpt-4\.1|gpt-5|gemini|qwen.*vl|kimi|moonshot/i.test(item.modelId))?.modelId ??
    visionTextModels[0]?.modelId ??
    models.find((item) => item.isDefaultPlanning)?.modelId ??
    models.find((item) => item.isDefaultAnalysis)?.modelId ??
    models.find((item) => (item.capabilities as Record<string, boolean>).structured_output)?.modelId ??
    null
  );
}

function readPreviewMeta(snapshot: unknown) {
  const raw = ((snapshot as Record<string, unknown> | null) ?? {}).previewConfig as Record<string, unknown> | null;
  return {
    imageAspectRatio: raw?.imageAspectRatio === "3:4" ? "3:4" : "9:16",
    contentLanguage: normalizeContentLanguage(raw?.contentLanguage),
  } as const;
}

async function normalizeProjectSections(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  let heroCursor = 0;
  let detailCursor = 0;

  await prisma.$transaction(
    project.sections.map((section, index) => {
      const isHero = section.type === "HERO";
      if (isHero) {
        heroCursor += 1;
      } else {
        detailCursor += 1;
      }

      return prisma.pageSection.update({
        where: { id: section.id },
        data: {
          order: index,
          sectionKey: isHero
            ? `hero_${String(heroCursor).padStart(2, "0")}`
            : `detail_${String(detailCursor).padStart(2, "0")}_${section.type.toLowerCase()}`,
        },
      });
    }),
  );

  const currentSnapshot = (project.modelSnapshot as Record<string, unknown> | null) ?? {};
  const currentPreviewMeta = readPreviewMeta(project.modelSnapshot);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...currentSnapshot,
        previewConfig: {
          ...(currentSnapshot.previewConfig as Record<string, unknown> | null),
          heroImageCount: heroCursor,
          detailSectionCount: detailCursor,
          imageAspectRatio: currentPreviewMeta.imageAspectRatio,
          contentLanguage: currentPreviewMeta.contentLanguage,
        },
      } as Prisma.InputJsonValue,
    },
  });
}

async function assertSectionMutationAllowed(projectId: string, options: { addingType?: string; deletingSectionId?: string; updatingSectionId?: string; nextType?: string }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  let heroCount = project.sections.filter((section) => section.type === "HERO").length;
  let detailCount = project.sections.filter((section) => section.type !== "HERO").length;

  if (options.addingType) {
    if (normalizeSectionType(options.addingType) === "HERO") {
      if (heroCount >= 5) {
        throw new Error("头图最多保留 5 张，请先删除或改成详情页后再新增。");
      }
      heroCount += 1;
    } else {
      if (detailCount >= 10) {
        throw new Error("详情页最多保留 10 张，请先删除或改成头图后再新增。");
      }
      detailCount += 1;
    }
  }

  if (options.deletingSectionId) {
    const target = project.sections.find((section) => section.id === options.deletingSectionId);
    if (!target) {
      throw new Error("Section not found.");
    }

    if (target.type === "HERO") {
      if (heroCount <= 3) {
        throw new Error("头图至少保留 1 张，不能继续删除。");
      }
      heroCount -= 1;
    } else {
      if (detailCount <= 4) {
        throw new Error("详情页至少保留 1 张，不能继续删除。");
      }
      detailCount -= 1;
    }
  }

  if (options.updatingSectionId && options.nextType) {
    const target = project.sections.find((section) => section.id === options.updatingSectionId);
    if (!target) {
      throw new Error("Section not found.");
    }

    const currentType = target.type;
    const nextType = normalizeSectionType(options.nextType);
    if (currentType !== nextType) {
      if (currentType === "HERO" && nextType !== "HERO") {
        if (heroCount <= 3) {
          throw new Error("头图至少保留 1 张，不能把当前头图改成详情页。");
        }
        if (detailCount >= 10) {
          throw new Error("详情页最多保留 10 张，请先删除多余详情页后再转换。");
        }
      }

      if (currentType !== "HERO" && nextType === "HERO") {
        if (detailCount <= 4) {
          throw new Error("详情页至少保留 1 张，不能把当前详情页改成头图。");
        }
        if (heroCount >= 5) {
          throw new Error("头图最多保留 5 张，请先删除多余头图后再转换。");
        }
      }
    }
  }
}

function buildPreviewDecisionPrompt(analysis: Record<string, unknown>, contentLanguage: ContentLanguage) {
  const context = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    styleTags: Array.isArray(analysis.styleTags) ? analysis.styleTags.slice(0, 6) : [],
    usageScenarios: Array.isArray(analysis.usageScenarios) ? analysis.usageScenarios.slice(0, 6) : [],
    coreSellingPoints: Array.isArray(analysis.coreSellingPoints) ? analysis.coreSellingPoints.slice(0, 8) : [],
    differentiationPoints: Array.isArray(analysis.differentiationPoints)
      ? analysis.differentiationPoints.slice(0, 6)
      : [],
    suggestedSectionPlan: Array.isArray(analysis.suggestedSectionPlan) ? analysis.suggestedSectionPlan.slice(0, 8) : [],
  };

  return [
    "You are a senior e-commerce creative strategist deciding the right image count plan for a product detail page.",
    "Return strict JSON only.",
    "heroImageCount must be an integer between 1 and 5.",
    "detailSectionCount must be an integer between 1 and 10.",
    `The target content language for the final page is ${contentLanguage}.`,
    "Hero images should be enough to cover distinct first-screen communication angles such as hero visual, selling point emphasis, scenario mood, trust, or differentiation.",
    "Detail sections should be enough to fully explain selling points, craftsmanship, specs, trust, and use cases without becoming repetitive.",
    "If the product is simple, reduce quantity. If the product needs richer explanation, increase quantity.",
    "",
    "Product context:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function buildFallbackDetail(index: number) {
  const template = detailFallbackSections[index % detailFallbackSections.length];
  return {
    type: normalizeSectionType(template.type),
    title: template.title,
    goal: template.goal,
    copy: template.copy,
    visualPrompt: template.visualPrompt,
    editableData: template.editableFields,
  };
}

function readAnalysisText(analysis: Record<string, unknown> | null | undefined, key: string) {
  const value = analysis?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readAnalysisList(analysis: Record<string, unknown> | null | undefined, key: string, limit = 6) {
  const value = analysis?.[key];
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .slice(0, limit)
    : [];
}

function buildFallbackPromptAppendix(
  analysis: Record<string, unknown> | null | undefined,
  sectionRole: string,
) {
  if (!analysis) return "";

  const context = [
    readAnalysisText(analysis, "productName") ? `商品名称：${readAnalysisText(analysis, "productName")}` : "",
    readAnalysisText(analysis, "category") ? `品类：${readAnalysisText(analysis, "category")}` : "",
    readAnalysisText(analysis, "subcategory") ? `子类目：${readAnalysisText(analysis, "subcategory")}` : "",
    readAnalysisText(analysis, "material") ? `材质：${readAnalysisText(analysis, "material")}` : "",
    readAnalysisText(analysis, "color") ? `颜色：${readAnalysisText(analysis, "color")}` : "",
    readAnalysisList(analysis, "usageScenarios").length
      ? `使用场景：${readAnalysisList(analysis, "usageScenarios").join(" / ")}`
      : "",
    readAnalysisList(analysis, "coreSellingPoints").length
      ? `核心卖点：${readAnalysisList(analysis, "coreSellingPoints").join(" / ")}`
      : "",
    readAnalysisText(analysis, "additionalInformation")
      ? `补充事实：${readAnalysisText(analysis, "additionalInformation")}`
      : "",
    readAnalysisText(analysis, "generationRequirements")
      ? `生图补充要求：${readAnalysisText(analysis, "generationRequirements")}`
      : "",
  ].filter(Boolean);

  if (!context.length) return "";

  return [
    "",
    `兜底规划增强要求：当前模块角色为「${sectionRole}」。必须基于以下商品事实和生图补充要求改写画面，不要生成通用商品模板：`,
    ...context,
    "必须把多角度、多使用场景、不同使用方式落实为具体镜头、场景、道具、手部交互、细节特写或构图差异。",
    "同一项目中的每张图都应保持商品主体一致，但镜头、场景、道具、卖点和图内文案要有明确差异。",
  ].join("\n");
}

function enrichFallbackSection<T extends { title: string; visualPrompt: string; editableData: Record<string, unknown> }>(
  section: T,
  analysis?: Record<string, unknown> | null,
) {
  const appendix = buildFallbackPromptAppendix(analysis, section.title);
  if (!appendix) return section;

  return {
    ...section,
    visualPrompt: `${section.visualPrompt}${appendix}`,
    editableData: {
      ...section.editableData,
      generationRequirements: readAnalysisText(analysis, "generationRequirements"),
      productContext: {
        productName: readAnalysisText(analysis, "productName"),
        category: readAnalysisText(analysis, "category"),
        usageScenarios: readAnalysisList(analysis, "usageScenarios"),
        coreSellingPoints: readAnalysisList(analysis, "coreSellingPoints"),
      },
    },
  };
}

function buildFallbackHero(index: number) {
  const template = heroFallbackSections[index % heroFallbackSections.length];
  return {
    type: "HERO",
    title: template.title,
    goal: template.goal,
    copy: template.copy,
    visualPrompt: template.visualPrompt,
    editableData: template.editableFields,
  };
}

function buildNormalizedSections(
  rawSections: RawPlannedSection[],
  heroImageCount: number,
  detailSectionCount: number,
  analysis?: Record<string, unknown> | null,
): NormalizedSection[] {
  const normalized = rawSections.map((section, index) => ({
    type: normalizeSectionType(section.type),
    title: section.title || `模块 ${index + 1}`,
    goal: section.goal || "突出商品卖点",
    copy: section.copy || "",
    visualPrompt: ensureBilingualPrompt(section.visualPrompt || "", section.title || `模块 ${index + 1}`),
    editableData: normalizeEditableFields(section.editableFields),
  }));

  const heroPool = normalized.filter((section) => section.type === "HERO");
  const detailPool = normalized.filter((section) => section.type !== "HERO");

  const finalHeroes = heroPool.slice(0, heroImageCount);
  while (finalHeroes.length < heroImageCount) {
    finalHeroes.push(enrichFallbackSection(buildFallbackHero(finalHeroes.length), analysis));
  }

  const finalDetails = detailPool.slice(0, detailSectionCount);
  while (finalDetails.length < detailSectionCount) {
    finalDetails.push(enrichFallbackSection(buildFallbackDetail(finalDetails.length), analysis));
  }

  return [...finalHeroes, ...finalDetails].map((section, index) => {
    if (section.type === "HERO") {
      return {
        ...section,
        sectionKey: `hero_${String(index + 1).padStart(2, "0")}`,
        order: index,
      };
    }

    const detailIndex = index + 1 - finalHeroes.length;
    return {
      ...section,
      sectionKey: `detail_${String(detailIndex).padStart(2, "0")}_${section.type.toLowerCase()}`,
      order: index,
    };
  });
}

export function buildFallbackPlanFromTemplates(
  heroImageCount: number,
  detailSectionCount: number,
  analysis?: Record<string, unknown> | null,
) {
  return buildNormalizedSections([], heroImageCount, detailSectionCount, analysis);
}

function shouldFallbackToTemplatePlan(error: unknown) {
  if (error instanceof z.ZodError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return /"sections"|expected array|invalid input: expected array|received undefined|section/i.test(message) ||
    /timed out|timeout|aborted|network|fetch failed|ECONNRESET|ETIMEDOUT|provider request timed out|provider request failed \(504\)|gateway time-out/i.test(message) ||
    message.includes("\u8d85\u65f6") ||
    message.includes("\u7f51\u7edc") ||
    message.includes("Provider \u8bf7\u6c42");
}

async function decidePreviewConfigWithAi(projectId: string, preferredModelId?: string | null) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { analysis: true, assets: true },
  });

  if (!project?.analysis) {
    throw new Error("请先完成商品分析，再进行页面规划。");
  }

  const { provider, adapter } = await getProviderAdapter();
  const model = pickMultimodalPlanningModel(provider.models, preferredModelId);

  if (!model) {
    throw new Error("当前没有可用的文案规划模型。");
  }

  const currentPreviewConfig = readPreviewConfig(project.modelSnapshot);
  const planningReferenceImages = await collectPlanningReferenceImages(project.assets as PlanningAsset[]);
  const prompt = buildPreviewDecisionPrompt(
    project.analysis.normalizedResult as Record<string, unknown>,
    currentPreviewConfig.contentLanguage,
  );
  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only.",
    userPrompt: prompt,
    schema: previewDecisionSchema,
    images: planningReferenceImages,
    timeoutMs: 90000,
    monitor: {
      projectId,
      operation: "preview_count_planning",
    },
  });

  const current = readPreviewConfig(project.modelSnapshot);
  const decided = previewConfigSchema.parse({
    heroImageCount: result.parsed.heroImageCount,
    detailSectionCount: result.parsed.detailSectionCount,
    imageAspectRatio: current.imageAspectRatio,
    contentLanguage: current.contentLanguage,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...(project.modelSnapshot as Record<string, unknown> | null),
        previewConfig: decided,
        previewConfigSource: "ai",
        previewConfigReason: result.parsed.reason,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    previewConfig: decided,
    reason: result.parsed.reason,
  };
}

export async function planSections(
  projectId: string,
  options?: {
    modelId?: string | null;
    previewConfig?: PreviewConfigInput | null;
    autoDecideCounts?: boolean;
  },
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { analysis: true, assets: true },
  });

  if (!project?.analysis) {
    throw new Error("请先完成商品分析，再进行页面规划。");
  }

  const { provider, adapter } = await getProviderAdapter();
  const model = pickMultimodalPlanningModel(provider.models, options?.modelId);

  if (!model) {
    throw new Error("当前没有可用的文案规划模型。");
  }

  const existingTask = await findRecentRunningTask({
    projectId,
    taskType: "PLAN",
    maxAgeMinutes: 10,
  });
  if (existingTask) {
    throw new Error("当前页面规划仍在进行中，请等待这一轮完成后再试。");
  }

  let previewConfig =
    options?.previewConfig != null ? previewConfigSchema.parse(options.previewConfig) : readPreviewConfig(project.modelSnapshot);
  let previewDecisionReason = "";

  if (options?.autoDecideCounts) {
    const decision = await decidePreviewConfigWithAi(projectId, model);
    previewConfig = decision.previewConfig;
    previewDecisionReason = decision.reason;
  }

  const planningReferenceImages = await collectPlanningReferenceImages(project.assets as PlanningAsset[]);

  const task = await createTask({
    projectId,
    taskType: "PLAN",
    inputPayload: { model, previewConfig, autoDecideCounts: Boolean(options?.autoDecideCounts) },
  });

  try {
    const prompt = buildSectionPlanningPrompt(
      project.analysis.normalizedResult as never,
      project.style,
      project.platform,
      previewConfig.detailSectionCount,
      previewConfig.heroImageCount,
      previewConfig.contentLanguage,
    );

    const result = await adapter.generateStructured({
      model,
      systemPrompt: "Return strict JSON only. sections must be complete.",
      userPrompt: prompt,
      schema: sectionPlanOutputSchema,
      images: planningReferenceImages,
      timeoutMs: 180000,
      monitor: {
        projectId,
        operation: "section_planning",
      },
    });

    await prisma.pageSection.deleteMany({ where: { projectId } });

    const rawSections = Array.isArray(result.parsed.sections) ? result.parsed.sections : [];
    const sections =
      rawSections.length > 0
        ? buildNormalizedSections(
            rawSections,
            previewConfig.heroImageCount,
            previewConfig.detailSectionCount,
            project.analysis.normalizedResult as Record<string, unknown>,
          )
        : buildFallbackPlanFromTemplates(
            previewConfig.heroImageCount,
            previewConfig.detailSectionCount,
            project.analysis.normalizedResult as Record<string, unknown>,
          );
    const visualStyleGuide = resolvePlanningVisualStyleGuide(project, result.parsed.visualStyleGuide);

    await prisma.pageSection.createMany({
      data: sections.map((section) => ({
        projectId,
        sectionKey: section.sectionKey,
        type: section.type as never,
        title: section.title,
        goal: section.goal,
        copy: section.copy,
        visualPrompt: section.visualPrompt,
        order: section.order,
        editableData: section.editableData as Prisma.InputJsonValue,
      })),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "PLANNED",
        modelSnapshot: {
          ...(project.modelSnapshot as Record<string, unknown> | null),
          planningModelId: model,
          previewConfig,
          previewConfigSource: options?.autoDecideCounts ? "ai" : "manual",
          previewConfigReason: previewDecisionReason,
          visualStyleGuide,
        } as Prisma.InputJsonValue,
      },
    });

    const saved = await prisma.pageSection.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
    await completeTask(task.id, { sections: saved, previewConfig, previewDecisionReason, visualStyleGuide });
    return {
      sections: saved,
      previewConfig,
      previewDecisionReason,
      visualStyleGuide,
    };
  } catch (error) {
    if (shouldFallbackToTemplatePlan(error)) {
      try {
        await prisma.pageSection.deleteMany({ where: { projectId } });
        const fallbackSections = buildFallbackPlanFromTemplates(
          previewConfig.heroImageCount,
          previewConfig.detailSectionCount,
          project.analysis.normalizedResult as Record<string, unknown>,
        );
        await prisma.pageSection.createMany({
          data: fallbackSections.map((section) => ({
            projectId,
            sectionKey: section.sectionKey,
            type: section.type as never,
            title: section.title,
            goal: section.goal,
            copy: section.copy,
            visualPrompt: section.visualPrompt,
            order: section.order,
            editableData: section.editableData as Prisma.InputJsonValue,
          })),
        });

        const fallbackVisualStyleGuide = resolvePlanningVisualStyleGuide(project);

        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: "PLANNED",
            modelSnapshot: {
              ...(project.modelSnapshot as Record<string, unknown> | null),
              planningModelId: model,
              previewConfig,
              previewConfigSource: options?.autoDecideCounts ? "ai" : "manual",
              previewConfigReason: `${previewDecisionReason ? `${previewDecisionReason}；` : ""}AI 返回结构不完整，已自动切换为模板规划。`,
              visualStyleGuide: fallbackVisualStyleGuide,
            } as Prisma.InputJsonValue,
          },
        });

        const saved = await prisma.pageSection.findMany({
          where: { projectId },
          orderBy: { order: "asc" },
        });

        await completeTask(task.id, {
          sections: saved,
          previewConfig,
          previewDecisionReason,
          fallbackMode: "template_plan",
          visualStyleGuide: fallbackVisualStyleGuide,
        });

        return {
          sections: saved,
          previewConfig,
          previewDecisionReason,
          fallbackMode: "template_plan" as const,
          visualStyleGuide: fallbackVisualStyleGuide,
        };
      } catch {
        await failTask(task.id, "AI 规划结果格式不完整，且模板规划回退失败。");
        throw new Error("AI 规划结果格式不完整，请稍后重试。");
      }
    }

    const message =
      error instanceof Error
        ? error.message.includes("timed out")
          ? "页面规划请求超时，请稍后重试，或在 AI 配置里改用更快的规划模型。"
          : error.message
        : "页面规划失败";
    await failTask(task.id, message);
    throw new Error(message);
  }
}

export async function regenerateVisualStyleGuide(projectId: string, preferredModelId?: string | null) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { analysis: true, assets: true },
  });

  if (!project?.analysis) {
    throw new Error("Please finish product analysis before generating the visual style guide.");
  }

  const { provider, adapter } = await getProviderAdapter();
  const model = pickMultimodalPlanningModel(provider.models, preferredModelId);

  if (!model) {
    throw new Error("No available planning model is configured.");
  }

  const previewConfig = readPreviewConfig(project.modelSnapshot);
  const planningReferenceImages = await collectPlanningReferenceImages(project.assets as PlanningAsset[]);
  const prompt = buildVisualStyleGuidePrompt(
    project.analysis.normalizedResult as never,
    project.style,
    project.platform,
    previewConfig.contentLanguage,
  );

  const result = await adapter.generateStructured({
    model,
    systemPrompt: "Return strict JSON only.",
    userPrompt: prompt,
    schema: visualStyleGuideSchema,
    images: planningReferenceImages,
    timeoutMs: 120000,
    monitor: {
      projectId,
      operation: "visual_style_guide_regenerate",
    },
  });

  const visualStyleGuide = normalizeVisualStyleGuide(
    result.parsed,
    buildProjectVisualStyleGuideFallback(project),
  );

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      modelSnapshot: {
        ...((project.modelSnapshot as Record<string, unknown> | null) ?? {}),
        visualStyleGuide,
        visualStyleGuideModelId: model,
        visualStyleGuideUpdatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    visualStyleGuide,
    project: updated,
  };
}

export async function createSection(
  projectId: string,
  input: {
    type: string;
    title: string;
    goal: string;
    copy: string;
    visualPrompt: string;
    editableFields?: Record<string, unknown>;
  },
) {
  await assertSectionMutationAllowed(projectId, { addingType: input.type });
  const count = await prisma.pageSection.count({ where: { projectId } });
  const created = await prisma.pageSection.create({
    data: {
      projectId,
      sectionKey:
        normalizeSectionType(input.type) === "HERO"
          ? `hero_${String(count + 1).padStart(2, "0")}`
          : `detail_${String(count + 1).padStart(2, "0")}_${nanoid(6)}`,
      type: normalizeSectionType(input.type) as never,
      title: input.title,
      goal: input.goal,
      copy: input.copy,
      visualPrompt: ensureBilingualPrompt(input.visualPrompt, input.title),
      order: count,
      editableData: (input.editableFields ?? {}) as Prisma.InputJsonValue,
    },
  });
  await normalizeProjectSections(projectId);
  return created;
}

export async function updateSection(sectionId: string, input: Record<string, unknown>) {
  const current = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });

  if (!current) {
    throw new Error("Section not found.");
  }

  if ("type" in input && typeof input.type === "string") {
    await assertSectionMutationAllowed(current.projectId, {
      updatingSectionId: sectionId,
      nextType: input.type,
    });
  }

  const payload = { ...input } as Record<string, unknown>;
  if ("visualPrompt" in payload && typeof payload.visualPrompt === "string") {
    payload.visualPrompt = ensureBilingualPrompt(payload.visualPrompt, String(payload.title ?? "当前模块"));
  }
  if ("type" in payload && typeof payload.type === "string") {
    payload.type = normalizeSectionType(payload.type) as never;
  }
  if ("editableData" in payload) {
    payload.editableData = payload.editableData as Prisma.InputJsonValue;
  }
  const updated = await prisma.pageSection.update({
    where: { id: sectionId },
    data: payload,
  });
  await normalizeProjectSections(current.projectId);
  return updated;
}

export async function deleteSection(sectionId: string) {
  const current = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });

  if (!current) {
    throw new Error("Section not found.");
  }

  await assertSectionMutationAllowed(current.projectId, { deletingSectionId: sectionId });
  const deleted = await prisma.pageSection.delete({
    where: { id: sectionId },
  });
  await normalizeProjectSections(current.projectId);
  return deleted;
}

export async function reorderSections(projectId: string, orderedSectionIds: string[]) {
  await prisma.$transaction(
    orderedSectionIds.map((sectionId, index) =>
      prisma.pageSection.update({
        where: { id: sectionId },
        data: { order: index },
      }),
    ),
  );

  await normalizeProjectSections(projectId);

  return prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}
