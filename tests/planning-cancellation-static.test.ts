import assert from "node:assert/strict";
import fs from "node:fs";

const plannerWorkspace = fs.readFileSync("components/planner/planner-workspace.tsx", "utf8");
const plannerService = fs.readFileSync("lib/services/planner-service.ts", "utf8");
const cancelRoute = fs.readFileSync("app/api/projects/[id]/cancel-planning/route.ts", "utf8");

assert.match(plannerWorkspace, /停止 AI 自动规划/);
assert.match(plannerWorkspace, /\/api\/projects\/\$\{project\.id\}\/cancel-planning/);
assert.match(plannerService, /registerTaskAbortController\(task\.id\)/);
assert.match(plannerService, /signal: taskSignal/);
assert.match(plannerService, /assertTaskNotCanceled\(task\.id\)/);
assert.match(plannerService, /releaseTaskAbortController\(task\.id\)/);
assert.match(cancelRoute, /taskType: "PLAN"/);
assert.match(cancelRoute, /cancelTask\(task\.id\)/);
