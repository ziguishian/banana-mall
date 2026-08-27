import type { ProductAnalysisOutput } from "@/lib/ai/schemas/product-analysis";
import {
  platformLabels,
  sectionTypeLabels,
  styleLabels,
  type PlatformOption,
  type StyleOption,
} from "@/types/domain";
import { contentLanguageNamesForPrompt, normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";

const sectionTypeGuide = Object.entries(sectionTypeLabels)
  .map(([key, label]) => `${key}=${label}`)
  .join(", ");

export function buildSectionPlanningPrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  detailSectionCount = 6,
  heroImageCount = 4,
  contentLanguage: ContentLanguage = "zh-CN",
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  const planningContext = {
    productName: analysis.productName,
    category: analysis.category,
    subcategory: analysis.subcategory,
    material: analysis.material,
    color: analysis.color,
    styleTags: analysis.styleTags.slice(0, 8),
    targetAudience: analysis.targetAudience.slice(0, 6),
    usageScenarios: analysis.usageScenarios.slice(0, 6),
    coreSellingPoints: analysis.coreSellingPoints.slice(0, 8),
    differentiationPoints: analysis.differentiationPoints.slice(0, 6),
    userConcerns: analysis.userConcerns.slice(0, 6),
    recommendedFocusPoints: analysis.recommendedFocusPoints.slice(0, 8),
    additionalInformation: analysis.additionalInformation,
    generationRequirements: analysis.generationRequirements,
    suggestedSectionPlan: analysis.suggestedSectionPlan.slice(0, 8),
  };
  const productRealityChecklist = [
    "Before writing any visualPrompt, infer how this exact product works physically: inlet/outlet direction, cable/plug position, seams, openings, hinges, buttons, handles, fluid direction, airflow direction, support points, gravity, shadows, and how a hand would hold or use it.",
    "Every section must include product-specific negative constraints in visualPrompt: state what must NOT happen for this product.",
    "Examples: for a hair dryer, airflow must come out of the nozzle only and never blow backward from the rear intake; the power cord must exit from the handle/base and remain visible, never disappearing into a table or wall; hair and fabric should react in the airflow direction. For a lamp, light must emit from the lamp head, not from the cable. For containers, openings, lids, drawers and hinges must align with the real product geometry.",
    "Avoid impossible physics: floating products without support, cables merging into surfaces, reversed airflow, liquids flowing upward, disconnected shadows, impossible reflections, text wrapped through objects, hands gripping through solid parts, and product parts bending in ways the real material cannot.",
    "Use the structured product analysis, which was produced from the uploaded main product image, as the geometry source of truth. Do not redesign the product mechanism. The image itself will be referenced again during image generation.",
  ];

  return [
    "You are a senior e-commerce content strategist and mobile detail-page planner.",
    `Platform: ${platformLabel}`,
    `Style: ${styleLabel}`,
    `Target content language: ${targetLanguage}`,
    "Create a mobile product-detail section plan based on the planning context below.",
    "Return strict JSON only.",
    "First define one project-level visualStyleGuide, then create all sections under that same visual system.",
    "visualStyleGuide must include: styleName, colorPalette, backgroundSystem, lighting, cameraLanguage, typography, layoutRules, propRules, productRenderingRules, negativeStyleConstraints.",
    "The visualStyleGuide is the source of truth for visual consistency across hero images and detail-page images.",
    "Before writing sections, reason from the product analysis as the source of truth: exact product category, visible geometry, mechanism, repeated-part count, materials, colors, size/spec facts, and what the product must not be mistaken for.",
    "Do not create generic manufacturing, craft, measuring-ruler, sticker-sheet, electronics, storage-box, appliance, or unrelated sections unless the product analysis clearly supports them.",
    "For puzzle cubes / speed cubes / Rubik-like cubes, the detail page should explain cube order, turning feel, layer seams, corner/edge/center pieces, color recognition, grip, stability, suitable users, package contents and real dimensions; avoid claiming unrelated sticker cutting, ruler measurement props, batteries, cables, airflow, screens, or appliance functions.",
    `The output must contain exactly ${heroImageCount + detailSectionCount} sections in total.`,
    `You must create exactly ${heroImageCount} hero sections and exactly ${detailSectionCount} non-hero detail sections.`,
    "All hero sections must come first in the output array.",
    `Hero sections represent individual square hero gallery images, so each hero section must have a distinct first-screen communication role across these ${heroImageCount} angles.`,
    "The hero sections should cover different roles such as primary visual, core selling point, scenario mood, trust, and differentiation without repeating the same purpose.",
    "For each hero section, describe a different concrete picture: camera angle, crop, product placement, scene/background, props, lighting, in-image title position, selling-point callouts, CTA placement, and what exact product feature is visible.",
    "Hero section visualPrompts must not reuse the same generic sentence. Each one needs at least 3 concrete visual details unique to that image.",
    "If generationRequirements is provided, treat it as a hard creative brief. Convert requirements such as multi-angle, multi-scene, and different usage methods into distinct hero/detail sections and concrete visualPrompt instructions.",
    "Do not merely repeat generationRequirements as generic text; operationalize it through camera angles, scenes, props, product interaction modes, section goals, and in-image copy.",
    "All non-hero sections must come after the hero sections.",
    "Each section item must include: id, type, title, goal, copy, visualPrompt, editableFields.",
    "Each section.visualPrompt must explicitly cite how it follows the shared visualStyleGuide: same palette, background system, lighting, typography, CTA style, safe margins, product rendering rules, and negative constraints.",
    `All user-facing section titles, goals, copy, and in-image text instructions must be written in ${targetLanguage}.`,
    "visualPrompt must use this exact two-part format:",
    `Primary Prompt: <visual direction in ${targetLanguage}>`,
    "English Prompt: <English image prompt>",
    "The visualPrompt must explicitly require the image model to generate the marketing title, selling points, supporting copy, and CTA directly inside the image, instead of relying on external DOM text.",
    `Allowed section types: ${sectionTypeGuide}`,
    "editableFields should include at least one of: sellingPoints, tone, compositionHint.",
    "editableFields must also include styleRole, sharedStyleAnchors, and localVariation. styleRole describes this section role inside the shared visual system. sharedStyleAnchors lists the visual elements that must remain identical with the rest of the project. localVariation describes what can change only in this one image.",
    "editableFields should also include negativeConstraints as an array of product-specific impossible or undesirable visual outcomes.",
    "Avoid duplicate section goals and avoid repeating the same section type excessively.",
    "The section flow should feel commercially complete and conversion-oriented.",
    "",
    "Return exactly this JSON shape:",
    `{
  "visualStyleGuide": {
    "styleName": "string",
    "colorPalette": "string",
    "backgroundSystem": "string",
    "lighting": "string",
    "cameraLanguage": "string",
    "typography": "string",
    "layoutRules": "string",
    "propRules": "string",
    "productRenderingRules": "string",
    "negativeStyleConstraints": "string"
  },
  "sections": [
    {
      "id": "string",
      "type": "hero | selling_points | scenario | detail_closeup | specs | material | comparison | gift_scene | brand_trust | summary | custom",
      "title": "string",
      "goal": "string",
      "copy": "string",
      "visualPrompt": "Primary Prompt: ...\nEnglish Prompt: ...",
      "editableFields": {
        "styleRole": "string",
        "sharedStyleAnchors": ["string"],
        "localVariation": "string",
        "negativeConstraints": ["string"]
      }
    }
  ]
}`,
    "",
    "Physical realism and product-specific constraints:",
    ...productRealityChecklist.map((item) => `- ${item}`),
    "",
    "Planning context:",
    JSON.stringify(planningContext, null, 2),
  ].join("\n");
}

export function buildVisualStyleGuidePrompt(
  analysis: ProductAnalysisOutput,
  style: string,
  platform: string,
  contentLanguage: ContentLanguage = "zh-CN",
) {
  const styleLabel = styleLabels[style as StyleOption] ?? style;
  const platformLabel = platformLabels[platform as PlatformOption] ?? platform;
  const targetLanguage = contentLanguageNamesForPrompt[normalizeContentLanguage(contentLanguage)];

  return [
    "You are a senior e-commerce art director defining one reusable visual system for a product detail page.",
    "Return strict JSON only. No markdown.",
    `Platform: ${platformLabel}`,
    `Requested style: ${styleLabel}`,
    `Target content language: ${targetLanguage}`,
    "Create one project-level visualStyleGuide that keeps hero images and detail-page images visually consistent while still allowing different section content.",
    "The guide must be practical for image generation prompts, specific to this exact product, and written in concise Chinese.",
    "Do not make a generic moodboard. Specify repeatable rules: colors, background, light, camera, typography, layout density, props, product rendering and negative constraints.",
    "",
    "Product analysis:",
    JSON.stringify(
      {
        productName: analysis.productName,
        category: analysis.category,
        subcategory: analysis.subcategory,
        material: analysis.material,
        color: analysis.color,
        styleTags: analysis.styleTags,
        coreSellingPoints: analysis.coreSellingPoints,
        differentiationPoints: analysis.differentiationPoints,
        usageScenarios: analysis.usageScenarios,
        additionalInformation: analysis.additionalInformation,
        generationRequirements: analysis.generationRequirements,
      },
      null,
      2,
    ),
    "",
    "Return exactly this JSON shape:",
    `{
  "styleName": "string",
  "colorPalette": "string",
  "backgroundSystem": "string",
  "lighting": "string",
  "cameraLanguage": "string",
  "typography": "string",
  "layoutRules": "string",
  "propRules": "string",
  "productRenderingRules": "string",
  "negativeStyleConstraints": "string"
}`,
  ].join("\n");
}
