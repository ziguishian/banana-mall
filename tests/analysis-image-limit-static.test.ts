import assert from "node:assert/strict";
import fs from "node:fs";

const analysisService = fs.readFileSync("lib/services/analysis-service.ts", "utf8");
const analysisWorkspace = fs.readFileSync("components/analysis/analysis-workspace.tsx", "utf8");

assert.match(analysisService, /const MAX_ANALYSIS_IMAGES = 10;/);
assert.match(analysisService, /project\.assets\.slice\(0, MAX_ANALYSIS_IMAGES\)/);
assert.doesNotMatch(analysisService, /project\.assets\.slice\(0, 6\)/);
assert.match(analysisWorkspace, /商品分析图最多取前 10 张，请合理规划分析图。/);
