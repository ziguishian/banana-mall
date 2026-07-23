import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function resolveWithProjectAlias(
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { buildFallbackPlanFromTemplates } = require("../lib/services/planner-service");

const analysis = {
  productName: "镜面不锈钢餐勺",
  category: "餐饮具",
  subcategory: "不锈钢汤勺",
  material: "不锈钢",
  color: "亮银色",
  styleTags: ["镜面亮光"],
  targetAudience: ["家庭用户"],
  usageScenarios: ["日常用餐", "喝汤盛粥"],
  coreSellingPoints: ["圆润宽勺头"],
  differentiationPoints: ["手柄带材质标识"],
  userConcerns: ["是否易清洁"],
  recommendedFocusPoints: ["展示勺头深度"],
  additionalInformation: "主图可见2支相同餐勺。",
  generationRequirements: "多角度：正面、45°斜侧、俯视、细节特写。多使用场景：日常用餐、收纳、礼品展示。",
  suggestedSectionPlan: [],
};

const sections = buildFallbackPlanFromTemplates(3, 4, analysis);
const combinedPrompt = sections.map((section: { visualPrompt: string }) => section.visualPrompt).join("\n\n");

assert.equal(sections.length, 7);
assert.match(combinedPrompt, /镜面不锈钢餐勺/);
assert.match(combinedPrompt, /多角度/);
assert.match(combinedPrompt, /45°斜侧/);
assert.match(combinedPrompt, /日常用餐/);
