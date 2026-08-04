import type { ProductAsset } from "@prisma/client";

import { visualPromptAgentSchema } from "@/lib/ai/schemas/visual-prompt";
import type { ProviderAdapter } from "@/lib/ai/provider-client";
import type { ContentLanguage } from "@/lib/utils/content-language";
import { visualStyleGuideToPrompt, type VisualStyleGuide } from "@/lib/utils/visual-style-guide";

type ProviderModelRecord = {
  modelId: string;
  capabilities: unknown;
  isDefaultPlanning?: boolean;
  isDefaultAnalysis?: boolean;
};

type ProviderContext = {
  models: ProviderModelRecord[];
};

const VISUAL_PROMPT_AGENT_TIMEOUT_MS = 60_000;

type VisualPromptMode = "ecommerce_section" | "xiaohongshu_page" | "image_edit";

type BuildVisualPromptInput = {
  provider: ProviderContext;
  adapter: ProviderAdapter;
  mode: VisualPromptMode;
  title: string;
  goal: string;
  copy: string;
  basePrompt: string;
  aspectRatio: "1:1" | "3:4" | "9:16";
  contentLanguage?: ContentLanguage | "zh-CN";
  referenceImages?: string[];
  referenceAssets?: Array<Pick<ProductAsset, "fileName" | "type" | "isMain">>;
  productContext?: unknown;
  visualStyleGuide?: VisualStyleGuide;
  projectId?: string;
  sectionId?: string;
  operation: string;
  signal?: AbortSignal;
};

function readCapabilities(model: ProviderModelRecord) {
  return (model.capabilities as Record<string, boolean> | null) ?? {};
}

function pickPromptModel(provider: ProviderContext, needsVision: boolean) {
  const textModels = provider.models.filter((model) => readCapabilities(model).text);
  const visionTextModels = textModels.filter((model) => readCapabilities(model).vision);
  const candidates = needsVision && visionTextModels.length > 0 ? visionTextModels : textModels;

  return (
    candidates.find((model) => model.isDefaultPlanning)?.modelId ??
    candidates.find((model) => model.isDefaultAnalysis)?.modelId ??
    candidates.find((model) => /gpt-4o|gpt-4\.1|gpt-5|gemini|qwen.*vl|kimi|moonshot/i.test(model.modelId))?.modelId ??
    candidates[0]?.modelId ??
    null
  );
}

function summarizeReferences(input: BuildVisualPromptInput) {
  const assetNames = input.referenceAssets?.map((asset) => {
    const role = asset.isMain ? "main product" : asset.type.toLowerCase();
    return `${asset.fileName} (${role})`;
  });
  const imageCount = input.referenceImages?.length ?? 0;

  if (!assetNames?.length && imageCount === 0) {
    return "No reference images.";
  }

  return [
    assetNames?.length ? `Reference assets: ${assetNames.join(" / ")}` : "",
    imageCount > 0 ? `Attached reference image count: ${imageCount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAgentPrompt(input: BuildVisualPromptInput) {
  const modeGuide =
    input.mode === "xiaohongshu_page"
      ? `Create a production-grade prompt for one Xiaohongshu ${input.aspectRatio} carousel image.`
      : input.mode === "image_edit"
        ? "Create a production-grade prompt for editing an existing image while preserving identity and composition continuity."
        : "Create a production-grade prompt for one e-commerce product detail page image.";

  return [
    "You are the system-level Visual Prompt Agent for an AI commerce design workflow.",
    "Your job is to analyze the task before image generation and write a detailed final prompt for the image model.",
    "Return strict JSON only. No markdown.",
    "",
    modeGuide,
    "",
    "The finalPrompt must be detailed and directly usable by an image generation/editing model.",
    "It must include:",
    "- business objective and target audience",
    "- canvas aspect ratio and crop",
    "- product/subject identity rules from reference images, especially the main product image as the non-negotiable source of truth",
    "- foreground, middle ground, background, props, scene, camera angle, product placement",
    "- lighting, material texture, color palette, depth, shadows and reflections",
    "- in-image typography: title position, hierarchy, copy blocks, CTA/badges, safe margins",
    "- product-specific physical rules and impossible phenomena to avoid",
    "- final quality bar for a polished Xiaohongshu/e-commerce visual",
    "- if a project-level visual style guide is provided, repeat and obey it as the highest-priority visual consistency contract",
    "",
    "Important constraints:",
    "- Preserve the product/object identity from reference images. The main product image is the factual source of truth for category, geometry, count of parts, colors, labels, openings, mechanisms, proportions and material. Do not invent a different product.",
    "- All visible text must be clear, correctly spelled, and in the target content language.",
    "- Do not create category mistakes or impossible mechanics: no reversed airflow, cables entering furniture, floating unsupported objects, liquid flowing upward, broken shadows, impossible reflections, wrong hinges/openings, wrong cube layer count, wrong tile grid, wrong corner/edge/center structure, or hands passing through objects.",
    "- Avoid vague words alone. Make every visual choice concrete.",
    "- For e-commerce sections, hero images and detail images must look like one cohesive commercial page: consistent color palette, background system, lighting direction, shadow softness, typography, CTA style, icon/badge language, spacing, and product rendering.",
    "- If reference images are attached, analyze them as geometry/style references, but do not describe them as 'uploaded image' inside the final artwork.",
    "",
    "Task context:",
    JSON.stringify(
      {
        mode: input.mode,
        title: input.title,
        goal: input.goal,
        copy: input.copy,
        basePrompt: input.basePrompt,
        aspectRatio: input.aspectRatio,
        contentLanguage: input.contentLanguage ?? "zh-CN",
        references: summarizeReferences(input),
        productContext: input.productContext ?? null,
        visualStyleGuide: input.visualStyleGuide ? visualStyleGuideToPrompt(input.visualStyleGuide) : null,
      },
      null,
      2,
    ),
    "",
    "Return this JSON shape:",
    `{
  "analysisSummary": "short analysis of the image strategy",
  "finalPrompt": "long detailed prompt for the image model",
  "negativePrompt": "what must not appear",
  "qualityChecklist": ["check 1", "check 2", "check 3"]
}`,
  ].join("\n");
}

function buildFallbackPrompt(input: BuildVisualPromptInput) {
  const referenceInstruction =
    (input.referenceImages?.length ?? 0) > 0 || (input.referenceAssets?.length ?? 0) > 0
      ? "Use the reference images as the source of truth for product identity, proportions, material, color, key openings, buttons, nozzles, handles, cables, logos and recognisable details."
      : "If no reference image is available, infer the subject carefully from the task context and keep it visually consistent.";

  const platformInstruction =
    input.mode === "xiaohongshu_page"
      ? `Design a native Xiaohongshu ${input.aspectRatio} carousel page with strong cover-like readability, useful content hierarchy, generous safe margins, and polished social-media typography.`
      : "Design a high-conversion e-commerce product visual that feels like finished marketplace artwork, not a blank poster or wireframe.";

  return [
    platformInstruction,
    `Aspect ratio: ${input.aspectRatio}.`,
    `Image title/theme: ${input.title}.`,
    `Business goal: ${input.goal}.`,
    `Core copy to express inside the image: ${input.copy}.`,
    `User/base visual direction: ${input.basePrompt}.`,
    referenceInstruction,
    input.visualStyleGuide ? `Project-level visual style guide that must be preserved across the whole project:\n${visualStyleGuideToPrompt(input.visualStyleGuide)}` : "No project-level visual style guide is available; create a clean reusable visual system and keep this image compatible with it.",
    "Create a concrete composition: define foreground subject placement, middle-ground information blocks, background scene, camera angle, crop, props, lighting direction, shadows, reflections, material texture, color palette, and depth.",
    "Typography must be designed inside the image with clear hierarchy: large readable title, short supporting copy, 2-4 concise labels or selling points, and optional CTA/badge placed away from product edges.",
    "Respect real-world physics and product mechanics: correct airflow/light/liquid direction, visible cable exit points, realistic support surfaces, gravity, contact shadows, aligned hinges/openings/drawers/buttons/handles.",
    "Negative constraints: no garbled text, no over-crowded typography, no distorted product geometry, no floating unsupported product, no cables merging into tables or walls, no reversed airflow, no impossible reflections, no hands passing through solid parts.",
    "Final output should be a polished, commercially usable image with crisp details and no explanatory UI chrome.",
  ].join("\n");
}

function shouldFallback(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /timed out|timeout|temperature|unsupported|invalid json|structured|parse|network error|fetch failed/i.test(error.message);
}

export async function buildVisualPromptWithAgent(input: BuildVisualPromptInput) {
  const model = pickPromptModel(input.provider, (input.referenceImages?.length ?? 0) > 0);
  if (!model) {
    return buildFallbackPrompt(input);
  }

  try {
    const result = await input.adapter.generateStructured({
      model,
      systemPrompt: "Return strict JSON only.",
      userPrompt: buildAgentPrompt(input),
      schema: visualPromptAgentSchema,
      images: input.referenceImages?.slice(0, 3),
      timeoutMs: VISUAL_PROMPT_AGENT_TIMEOUT_MS,
      suppressUsageLog: true,
      signal: input.signal,
    });

    const parsed = result.parsed;
    return [
      parsed.finalPrompt,
      parsed.negativePrompt ? `Negative prompt / avoid: ${parsed.negativePrompt}` : "",
      parsed.qualityChecklist.length ? `Quality checklist: ${parsed.qualityChecklist.join("；")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } catch (error) {
    if (shouldFallback(error)) {
      return buildFallbackPrompt(input);
    }
    throw error;
  }
}
