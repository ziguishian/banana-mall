import assert from "node:assert/strict";

import { analysisPatchSchema } from "../lib/validations/analysis";

const normalizedResult = {
  productName: "银色一体式不锈钢餐勺",
  category: "餐饮具",
  subcategory: "不锈钢汤勺",
  material: "不锈钢",
  color: "亮面银色",
  styleTags: ["简约现代", "镜面质感"],
  targetAudience: ["家庭用户"],
  usageScenarios: ["日常用餐"],
  coreSellingPoints: ["一体成型"],
  differentiationPoints: ["边缘圆润"],
  userConcerns: ["是否易清洁"],
  recommendedFocusPoints: ["材质质感"],
  additionalInformation: "尺寸信息：待补充。",
  generationRequirements: "生成多角度、多使用场景、不同使用方式的图片。",
  suggestedSectionPlan: [
    {
      type: "hero",
      title: "多角度主视觉",
      goal: "展示商品正面、侧面和使用场景。",
    },
  ],
};

const parsed = analysisPatchSchema.parse({ normalizedResult });

assert.equal(parsed.normalizedResult.additionalInformation, normalizedResult.additionalInformation);
assert.equal(parsed.normalizedResult.generationRequirements, normalizedResult.generationRequirements);
