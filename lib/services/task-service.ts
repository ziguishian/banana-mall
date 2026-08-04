import { Prisma, type GenerationTask, type TaskStatus, type TaskType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type MxTaskType = TaskType;

const globalTaskAbortControllers = globalThis as typeof globalThis & {
  mxpageTaskAbortControllers?: Map<string, AbortController>;
};
const taskAbortControllers =
  globalTaskAbortControllers.mxpageTaskAbortControllers ?? new Map<string, AbortController>();

if (process.env.NODE_ENV !== "production") {
  globalTaskAbortControllers.mxpageTaskAbortControllers = taskAbortControllers;
}

function toJsonValue(value: unknown) {
  return (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function createTask(input: {
  projectId: string;
  sectionId?: string | null;
  taskType: MxTaskType;
  inputPayload?: unknown;
  outputPayload?: unknown;
  status?: TaskStatus;
}) {
  const status = input.status ?? "RUNNING";
  return prisma.generationTask.create({
    data: {
      projectId: input.projectId,
      sectionId: input.sectionId ?? null,
      taskType: input.taskType,
      status,
      startedAt: status === "RUNNING" ? new Date() : null,
      inputPayload: toJsonValue(input.inputPayload),
      outputPayload: toJsonValue(input.outputPayload),
    },
  });
}

export async function findRecentRunningTask(input: {
  projectId: string;
  taskType: MxTaskType;
  sectionId?: string | null;
  maxAgeMinutes?: number;
}) {
  const maxAgeMinutes = input.maxAgeMinutes ?? 10;
  const startedAfter = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  return prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      sectionId: input.sectionId ?? null,
      taskType: input.taskType,
      status: "RUNNING",
      startedAt: {
        gte: startedAfter,
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function getTask(taskId: string) {
  return prisma.generationTask.findUnique({
    where: { id: taskId },
  });
}

export async function startTask(taskId: string, patch?: unknown) {
  const current = await getTask(taskId);
  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "RUNNING",
      startedAt: current?.startedAt ?? new Date(),
      outputPayload: toJsonValue({
        ...asRecord(current?.outputPayload),
        ...asRecord(patch),
      }),
    },
  });
}

export async function updateTaskProgress(taskId: string, patch: Record<string, unknown>) {
  const current = await getTask(taskId);
  if (!current || current.status === "SUCCESS" || current.status === "FAILED" || current.status === "CANCELED") {
    return current;
  }

  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      outputPayload: toJsonValue({
        ...asRecord(current.outputPayload),
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function completeTask(taskId: string, outputPayload?: unknown) {
  const current = await getTask(taskId);
  if (current?.status === "SUCCESS" || current?.status === "FAILED" || current?.status === "CANCELED") {
    return current;
  }

  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "SUCCESS",
      completedAt: new Date(),
      outputPayload: toJsonValue({
        ...asRecord(current?.outputPayload),
        ...asRecord(outputPayload),
        completedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function failTask(taskId: string, errorMessage: string, outputPayload?: unknown) {
  const current = await getTask(taskId);
  if (current?.status === "SUCCESS" || current?.status === "FAILED" || current?.status === "CANCELED") {
    return current;
  }

  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage,
      outputPayload: toJsonValue({
        ...asRecord(current?.outputPayload),
        ...asRecord(outputPayload),
        failedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function cancelTask(taskId: string) {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const output = asRecord(task.outputPayload);
  const currentTaskId = typeof output.currentTaskId === "string" ? output.currentTaskId : null;
  const currentTask = currentTaskId ? await getTask(currentTaskId) : null;
  const canceled = await prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "CANCELED",
      completedAt: new Date(),
      errorMessage: "Canceled by user.",
    },
  });

  if (currentTaskId) {
    await prisma.generationTask.updateMany({
      where: { id: currentTaskId, status: { in: ["PENDING", "RUNNING"] } },
      data: {
        status: "CANCELED",
        completedAt: new Date(),
        errorMessage: "Canceled by user.",
      },
    });
    taskAbortControllers.get(currentTaskId)?.abort(new Error("Task canceled."));
  }

  taskAbortControllers.get(taskId)?.abort(new Error("Task canceled."));

  const sectionIds = [task.sectionId, currentTask?.sectionId].filter(
    (sectionId): sectionId is string => typeof sectionId === "string",
  );
  for (const sectionId of new Set(sectionIds)) {
    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
      select: { currentImageAssetId: true },
    });
    if (section) {
      await prisma.pageSection.update({
        where: { id: sectionId },
        data: { status: section.currentImageAssetId ? "SUCCESS" : "IDLE" },
      });
    }
  }

  return canceled;
}

export function registerTaskAbortController(taskId: string) {
  const controller = new AbortController();
  taskAbortControllers.set(taskId, controller);
  return controller.signal;
}

export function releaseTaskAbortController(taskId: string) {
  taskAbortControllers.delete(taskId);
}

export async function recoverStaleBulkGenerationTask(task: GenerationTask | null) {
  if (
    !task ||
    task.taskType !== "GENERATE" ||
    task.sectionId !== null ||
    (task.status !== "PENDING" && task.status !== "RUNNING")
  ) {
    return task;
  }

  const output = asRecord(task.outputPayload);
  const heartbeatAt = typeof output.heartbeatAt === "string" ? Date.parse(output.heartbeatAt) : Number.NaN;
  const fallbackActivityAt = task.updatedAt.getTime();
  const lastActivityAt = Number.isFinite(heartbeatAt) ? heartbeatAt : fallbackActivityAt;
  const staleAfterMs = Number.isFinite(heartbeatAt) ? 90_000 : 5 * 60_000;
  if (Date.now() - lastActivityAt <= staleAfterMs) {
    return task;
  }

  const message = "批量生成后台执行已中断，系统已结束遗留任务，请重新生成未完成模块。";
  const currentTaskId = typeof output.currentTaskId === "string" ? output.currentTaskId : null;
  const currentTask = currentTaskId ? await getTask(currentTaskId) : null;

  await prisma.generationTask.update({
    where: { id: task.id },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: message,
      outputPayload: toJsonValue({
        ...output,
        currentStep: "stale_task_recovered",
        staleRecoveredAt: new Date().toISOString(),
      }),
    },
  });

  if (currentTaskId) {
    await prisma.generationTask.updateMany({
      where: { id: currentTaskId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
    });
    taskAbortControllers.get(currentTaskId)?.abort(new Error("Task canceled."));
  }

  if (currentTask?.sectionId) {
    const section = await prisma.pageSection.findUnique({
      where: { id: currentTask.sectionId },
      select: { currentImageAssetId: true },
    });
    if (section) {
      await prisma.pageSection.update({
        where: { id: currentTask.sectionId },
        data: { status: section.currentImageAssetId ? "SUCCESS" : "IDLE" },
      });
    }
  }

  taskAbortControllers.get(task.id)?.abort(new Error("Task canceled."));
  return getTask(task.id);
}

export async function getTaskWithStaleRecovery(taskId: string) {
  return recoverStaleBulkGenerationTask(await getTask(taskId));
}

export async function assertTaskNotCanceled(taskId: string) {
  const task = await getTask(taskId);
  if (task?.status === "CANCELED") {
    throw new Error("Task canceled.");
  }
  if (task?.status === "FAILED") {
    throw new Error(task.errorMessage || "Task stopped.");
  }
  return task;
}

export function runTaskInBackground(handler: () => Promise<void>) {
  void handler().catch((error) => {
    console.error("[Task Runner] Unhandled background task error", error);
  });
}
