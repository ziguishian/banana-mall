import assert from "node:assert/strict";
import fs from "node:fs";

const outputConfigCard = fs.readFileSync("components/shared/project-output-config-card.tsx", "utf8");
const plannerWorkspace = fs.readFileSync("components/planner/planner-workspace.tsx", "utf8");
const plannerService = fs.readFileSync("lib/services/planner-service.ts", "utf8");
const planRoute = fs.readFileSync("app/api/projects/[id]/plan-sections/route.ts", "utf8");

for (const source of [outputConfigCard, plannerWorkspace]) {
  assert.match(source, /Math\.max\(1, Number\([\s\S]*heroImageCount/);
  assert.match(source, /Math\.max\(1, Number\([\s\S]*detailSectionCount/);
}

assert.match(outputConfigCard, /\[1, 2, 3, 4, 5\]/);
assert.match(outputConfigCard, /\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10\]/);

for (const source of [plannerService, planRoute]) {
  assert.match(source, /heroImageCount: z\.number\(\)\.int\(\)\.min\(1\)\.max\(5\)/);
  assert.match(source, /detailSectionCount: z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)/);
}

assert.doesNotMatch(plannerService, /至少保留 3 张/);
assert.doesNotMatch(plannerService, /至少保留 4 张/);
