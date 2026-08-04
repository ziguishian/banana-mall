import fs from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";

import type { XiaohongshuPlan } from "@/lib/ai/schemas/xiaohongshu";
import { prisma } from "@/lib/db/prisma";
import { analyzeProject } from "@/lib/services/analysis-service";
import { editSectionImage, generateSectionImage, regenerateSectionImage } from "@/lib/services/generation-service";
import { planSections } from "@/lib/services/planner-service";
import { createProject } from "@/lib/services/project-service";
import { runWithProviderCredentials, type RequestProviderCredentials } from "@/lib/services/provider-runtime";
import {
  assertTaskNotCanceled,
  cancelTask,
  completeTask,
  createTask,
  failTask,
  getTask,
  recoverStaleBulkGenerationTask,
  runTaskInBackground,
  startTask,
  updateTaskProgress,
} from "@/lib/services/task-service";
import { generateXiaohongshuImages, type XiaohongshuImageAspectRatio } from "@/lib/services/xiaohongshu-service";
import { saveUploadAsset } from "@/lib/storage/asset-manager";
import { normalizeContentLanguage, type ContentLanguage } from "@/lib/utils/content-language";
import { env } from "@/lib/utils/env";
import { sanitizeFileName } from "@/lib/utils/files";

export type BatchCreateFileInput = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

export type BatchCreateTaskInput = {
  files: BatchCreateFileInput[];
  autoGenerateImages?: boolean;
};

export type XiaohongshuGenerateTaskInput = {
  plan: XiaohongshuPlan;
  imageAspectRatio?: XiaohongshuImageAspectRatio;
  referenceImages?: string[];
};

export type TranslatePageTaskInput = {
  projectId: string;
  targetLanguage: ContentLanguage;
  referenceAssetIds?: string[];
};

export type GenerateAllSectionsTaskInput = {
  projectId: string;
  mode?: "all" | "missing";
};

type StoredBatchFile = {
  fileName: string;
  mimeType: string;
  filePath: string;
};

type BatchItemStatus = {
  fileName: string;
  state: "pending" | "running" | "done" | "failed";
  message: string;
  projectId?: string | null;
};

const systemProjectPlatform = "__mxpage_system_task__";

function storageRoot() {
  return path.resolve(process.cwd(), env.STORAGE_ROOT);
}

function taskInputDir(taskId: string) {
  return path.join(storageRoot(), "task-inputs", taskId);
}

async function ensureSystemTaskProject() {
  const existing = await prisma.project.findFirst({
    where: { platform: systemProjectPlatform },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.project.create({
    data: {
      name: "MxPage 系统任务",
      platform: systemProjectPlatform,
      style: "system",
      description: "内部后台任务占位项目，不在历史记录中展示。",
    },
  });
}

function nowStamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
}

function buildBatchProjectName(fileName: string, index: number) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || `批量商品-${index + 1}`;
  return `${baseName}-${nowStamp()}`;
}

function batchStatuses(files: Array<{ fileName: string }>): BatchItemStatus[] {
  return files.map((file) => ({
    fileName: file.fileName,
    state: "pending",
    message: "等待处理",
    projectId: null,
  }));
}

function patchBatchStatus(items: BatchItemStatus[], index: number, patch: Partial<BatchItemStatus>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

async function persistBatchFiles(taskId: string, files: BatchCreateFileInput[]) {
  const dir = taskInputDir(taskId);
  await fs.mkdir(dir, { recursive: true });

  const stored: StoredBatchFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const safeName = `${String(index + 1).padStart(2, "0")}-${sanitizeFileName(file.fileName)}`;
    const absolutePath = path.join(dir, safeName);
    await fs.writeFile(absolutePath, Buffer.from(file.base64Data, "base64"));
    stored.push({
      fileName: file.fileName,
      mimeType: file.mimeType,
      filePath: path.relative(storageRoot(), absolutePath),
    });
  }

  return stored;
}

async function readStoredBatchFile(file: StoredBatchFile) {
  return fs.readFile(path.join(storageRoot(), file.filePath));
}

async function runBatchCreateTask(taskId: string, files: StoredBatchFile[], autoGenerateImages: boolean) {
  let items = batchStatuses(files);
  let successCount = 0;
  let failedCount = 0;
  const projectIds: string[] = [];

  await startTask(taskId, {
    totalItems: files.length,
    completedItems: 0,
    failedItems: 0,
    currentStep: "batch_create_started",
    items,
  });

  try {
    for (let index = 0; index < files.length; index += 1) {
      await assertTaskNotCanceled(taskId);
      const file = files[index];
      items = patchBatchStatus(items, index, { state: "running", message: "正在创建项目" });
      await updateTaskProgress(taskId, { currentStep: "creating_project", items });

      try {
        const project = await createProject({
          name: buildBatchProjectName(file.fileName, index),
          platform: "general_ecommerce",
          style: "generic_clean",
          description: "由批量创建自动生成",
        });
        projectIds.push(project.id);
        items = patchBatchStatus(items, index, { projectId: project.id, message: "正在上传主商品图" });
        await updateTaskProgress(taskId, { currentStep: "uploading_asset", items, projectIds });

        const fileBuffer = await readStoredBatchFile(file);
        await saveUploadAsset({
          projectId: project.id,
          type: "MAIN",
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileBuffer,
          sortOrder: 0,
          isMain: true,
        });

        items = patchBatchStatus(items, index, { message: "正在分析商品信息" });
        await updateTaskProgress(taskId, { currentStep: "analyzing_project", items, projectIds });
        await analyzeProject(project.id);

        items = patchBatchStatus(items, index, { message: "正在规划详情页结构" });
        await updateTaskProgress(taskId, { currentStep: "planning_sections", items, projectIds });
        await planSections(project.id, { autoDecideCounts: true });

        if (autoGenerateImages) {
          const sections = await prisma.pageSection.findMany({
            where: { projectId: project.id },
            orderBy: { order: "asc" },
          });

          for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
            await assertTaskNotCanceled(taskId);
            const section = sections[sectionIndex];
            items = patchBatchStatus(items, index, {
              message: `正在生成图片 ${sectionIndex + 1}/${sections.length}${section.title ? `：${section.title}` : ""}`,
            });
            await updateTaskProgress(taskId, {
              currentStep: "generating_images",
              items,
              projectIds,
              estimatedImageCount: sections.length,
            });
            await generateSectionImage(project.id, section.id, null, []);
          }
        }

        successCount += 1;
        items = patchBatchStatus(items, index, {
          state: "done",
          message: autoGenerateImages ? "已完成分析、规划与图片生成" : "已完成分析与详情页规划",
          projectId: project.id,
        });
      } catch (error) {
        failedCount += 1;
        items = patchBatchStatus(items, index, {
          state: "failed",
          message: error instanceof Error ? error.message : "处理失败",
        });
      }

      await updateTaskProgress(taskId, {
        currentStep: "batch_item_finished",
        totalItems: files.length,
        completedItems: successCount,
        failedItems: failedCount,
        items,
        projectIds,
      });
    }

    await completeTask(taskId, {
      currentStep: "batch_create_finished",
      totalItems: files.length,
      completedItems: successCount,
      failedItems: failedCount,
      items,
      projectIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Task canceled.") {
      return;
    }
    await failTask(taskId, error instanceof Error ? error.message : "Batch create failed", {
      currentStep: "batch_create_failed",
      totalItems: files.length,
      completedItems: successCount,
      failedItems: failedCount,
      items,
      projectIds,
    });
  }
}

export async function createBatchCreateTask(input: BatchCreateTaskInput, credentials: RequestProviderCredentials) {
  const systemProject = await ensureSystemTaskProject();
  const filesMeta = input.files.map((file) => ({ fileName: file.fileName, mimeType: file.mimeType }));
  const task = await createTask({
    projectId: systemProject.id,
    taskType: "BATCH_CREATE",
    status: "PENDING",
    inputPayload: {
      files: filesMeta,
      autoGenerateImages: input.autoGenerateImages === true,
    },
    outputPayload: {
      totalItems: input.files.length,
      completedItems: 0,
      failedItems: 0,
      currentStep: "queued",
      items: batchStatuses(filesMeta),
    },
  });
  const storedFiles = await persistBatchFiles(task.id, input.files);
  await prisma.generationTask.update({
    where: { id: task.id },
    data: {
      inputPayload: {
        files: storedFiles,
        autoGenerateImages: input.autoGenerateImages === true,
      } as Prisma.InputJsonValue,
    },
  });

  runTaskInBackground(() => runWithProviderCredentials(credentials, () => runBatchCreateTask(task.id, storedFiles, input.autoGenerateImages === true)));
  return getTask(task.id);
}

async function runTranslatePageTask(taskId: string, input: TranslatePageTaskInput) {
  const targetLanguage = normalizeContentLanguage(input.targetLanguage);
  const sections = await prisma.pageSection.findMany({
    where: {
      projectId: input.projectId,
      currentImageAssetId: { not: null },
    },
    orderBy: { order: "asc" },
  });
  let successCount = 0;
  let failedCount = 0;
  const items = sections.map((section) => ({
    sectionId: section.id,
    title: section.title,
    state: "pending",
    message: "等待转换",
  }));

  await startTask(taskId, {
    totalItems: sections.length,
    completedItems: 0,
    failedItems: 0,
    targetLanguage,
    currentStep: "translate_started",
    items,
  });

  try {
    for (let index = 0; index < sections.length; index += 1) {
      await assertTaskNotCanceled(taskId);
      const section = sections[index];
      items[index] = { ...items[index], state: "running", message: "正在转换图内文字" };
      await updateTaskProgress(taskId, { currentStep: "translating_section", items });

      try {
        const result = await editSectionImage(input.projectId, section.id, {
          referenceAssetIds: input.referenceAssetIds ?? [],
          editMode: "translate",
          targetLanguage,
        });
        successCount += 1;
        items[index] = {
          ...items[index],
          state: "done",
          message: "已转换",
          imageAssetId: result.imageAsset.id,
        } as never;
      } catch (error) {
        failedCount += 1;
        items[index] = {
          ...items[index],
          state: "failed",
          message: error instanceof Error ? error.message : "转换失败",
        };
      }

      await updateTaskProgress(taskId, {
        currentStep: "translate_item_finished",
        totalItems: sections.length,
        completedItems: successCount,
        failedItems: failedCount,
        targetLanguage,
        items,
      });
    }

    await completeTask(taskId, {
      currentStep: "translate_finished",
      totalItems: sections.length,
      completedItems: successCount,
      failedItems: failedCount,
      targetLanguage,
      items,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Task canceled.") return;
    await failTask(taskId, error instanceof Error ? error.message : "Translate page failed", {
      currentStep: "translate_failed",
      totalItems: sections.length,
      completedItems: successCount,
      failedItems: failedCount,
      targetLanguage,
      items,
    });
  }
}

function isProviderWideImageFailure(message: string) {
  return (
    message.includes("当前 Provider 没有可用的真实图片生成端点") ||
    message.includes("当前 Provider 没有识别到可用于真实图片生成的模型")
  );
}

async function runGenerateAllSectionsTask(taskId: string, input: GenerateAllSectionsTaskInput) {
  const mode = input.mode ?? "all";
  const sections = await prisma.pageSection.findMany({
    where: {
      projectId: input.projectId,
      ...(mode === "missing" ? { currentImageAssetId: null } : {}),
    },
    orderBy: { order: "asc" },
  });
  let completedItems = 0;
  let failedItems = 0;
  let fallbackCount = 0;
  let canceledItems = 0;

  await startTask(taskId, {
    totalItems: sections.length,
    completedItems,
    failedItems,
    fallbackCount,
    canceledItems,
    currentTitle: sections[0]?.title ?? null,
    currentSectionId: sections[0]?.id ?? null,
    currentTaskId: null,
    mode,
    heartbeatAt: new Date().toISOString(),
    currentStep: "generating_images",
  });

  const heartbeatTimer = setInterval(() => {
    void updateTaskProgress(taskId, { heartbeatAt: new Date().toISOString() });
  }, 15_000);

  try {
    for (let index = 0; index < sections.length; index += 1) {
      await assertTaskNotCanceled(taskId);
      const section = sections[index];
      await updateTaskProgress(taskId, {
        totalItems: sections.length,
        completedItems,
        failedItems,
        fallbackCount,
        canceledItems,
        currentIndex: index,
        currentTitle: section.title,
        currentSectionId: section.id,
        currentTaskId: null,
        currentStep: "generating_image",
      });

      try {
        const onTaskCreated = async (currentTaskId: string) => {
          await updateTaskProgress(taskId, {
            currentTaskId,
            currentSectionId: section.id,
            currentTitle: section.title,
          });
          const parentTask = await getTask(taskId);
          const parentOutput =
            parentTask?.outputPayload &&
            typeof parentTask.outputPayload === "object" &&
            !Array.isArray(parentTask.outputPayload)
              ? (parentTask.outputPayload as Record<string, unknown>)
              : {};
          if (parentTask?.status === "CANCELED" || parentOutput.cancelSectionId === section.id) {
            await cancelTask(currentTaskId);
          }
        };
        const result = section.currentImageAssetId
          ? await regenerateSectionImage(input.projectId, section.id, null, [], onTaskCreated)
          : await generateSectionImage(input.projectId, section.id, null, [], onTaskCreated);
        completedItems += 1;
        if (result.generationMode === "svg_fallback") {
          fallbackCount += 1;
        }
        await updateTaskProgress(taskId, {
          totalItems: sections.length,
          completedItems,
          failedItems,
          fallbackCount,
          canceledItems,
          currentIndex: index,
          currentTitle: section.title,
          currentSectionId: section.id,
          currentTaskId: null,
          currentStep: "image_completed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "模块生成失败";
        const canceled = /task canceled/i.test(message);
        if (canceled) {
          canceledItems += 1;
        } else {
          failedItems += 1;
        }
        await updateTaskProgress(taskId, {
          totalItems: sections.length,
          completedItems,
          failedItems,
          fallbackCount,
          canceledItems,
          currentIndex: index,
          currentTitle: section.title,
          currentTaskId: null,
          cancelSectionId: null,
          currentStep: canceled ? "image_canceled" : "image_failed",
          lastError: message,
        });

        if (!canceled && isProviderWideImageFailure(message)) {
          throw new Error(`批量生成已停止：${message}`);
        }
      }
    }

    await completeTask(taskId, {
      totalItems: sections.length,
      completedItems,
      failedItems,
      fallbackCount,
      canceledItems,
      currentTitle: null,
      currentSectionId: null,
      currentTaskId: null,
      cancelSectionId: null,
      currentStep: "generate_all_finished",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Task canceled.") return;
    await failTask(taskId, error instanceof Error ? error.message : "批量生成失败", {
      totalItems: sections.length,
      completedItems,
      failedItems,
      fallbackCount,
      canceledItems,
      currentStep: "generate_all_failed",
    });
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function createGenerateAllSectionsTask(
  input: GenerateAllSectionsTaskInput,
  credentials: RequestProviderCredentials,
) {
  const mode = input.mode ?? "all";
  const sections = await prisma.pageSection.findMany({
    where: {
      projectId: input.projectId,
      ...(mode === "missing" ? { currentImageAssetId: null } : {}),
    },
    orderBy: { order: "asc" },
    select: { id: true, title: true },
  });
  if (sections.length === 0) {
    throw new Error(mode === "missing" ? "当前规划没有未生成的模块图。" : "请先完成页面规划，再开始批量生成。");
  }

  const recentThreshold = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const existingTask = await prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      sectionId: null,
      taskType: "GENERATE",
      status: { in: ["PENDING", "RUNNING"] },
      createdAt: { gte: recentThreshold },
    },
    orderBy: { createdAt: "desc" },
  });
  const activeExistingTask = await recoverStaleBulkGenerationTask(existingTask);
  if (activeExistingTask?.status === "PENDING" || activeExistingTask?.status === "RUNNING") {
    throw new Error("当前页面的全部模块图仍在生成中，请等待这一轮完成后再试。");
  }

  const activeSectionTask = await prisma.generationTask.findFirst({
    where: {
      projectId: input.projectId,
      sectionId: { not: null },
      taskType: { in: ["GENERATE", "REGENERATE"] },
      status: "RUNNING",
      startedAt: { gte: new Date(Date.now() - 20 * 60 * 1000) },
    },
  });
  if (activeSectionTask) {
    throw new Error("当前有模块图正在单独生成，请等待完成后再开始批量生成。");
  }

  const task = await createTask({
    projectId: input.projectId,
    taskType: "GENERATE",
    status: "PENDING",
    inputPayload: input,
    outputPayload: {
      totalItems: sections.length,
      completedItems: 0,
      failedItems: 0,
      fallbackCount: 0,
      canceledItems: 0,
      currentTitle: sections[0]?.title ?? null,
      currentSectionId: sections[0]?.id ?? null,
      currentTaskId: null,
      cancelSectionId: null,
      mode,
      heartbeatAt: new Date().toISOString(),
      currentStep: "queued",
    },
  });

  runTaskInBackground(() =>
    runWithProviderCredentials(credentials, () => runGenerateAllSectionsTask(task.id, input)),
  );
  return getTask(task.id);
}

export async function createTranslatePageTask(input: TranslatePageTaskInput, credentials: RequestProviderCredentials) {
  const task = await createTask({
    projectId: input.projectId,
    taskType: "TRANSLATE_PAGE",
    status: "PENDING",
    inputPayload: {
      projectId: input.projectId,
      targetLanguage: normalizeContentLanguage(input.targetLanguage),
      referenceAssetIds: input.referenceAssetIds ?? [],
    },
    outputPayload: {
      totalItems: 0,
      completedItems: 0,
      failedItems: 0,
      currentStep: "queued",
      targetLanguage: normalizeContentLanguage(input.targetLanguage),
    },
  });

  runTaskInBackground(() => runWithProviderCredentials(credentials, () => runTranslatePageTask(task.id, input)));
  return getTask(task.id);
}

async function runXiaohongshuGenerateTask(taskId: string, input: XiaohongshuGenerateTaskInput) {
  const imageAspectRatio = input.imageAspectRatio ?? "3:4";
  const pages = input.plan.pages;
  let images: unknown[] = [];
  let successCount = 0;
  let failedCount = 0;
  const items = pages.map((page) => ({
    pageNumber: page.pageNumber,
    title: page.title,
    state: "pending",
    message: "等待生成",
  }));

  await startTask(taskId, {
    totalItems: pages.length,
    completedItems: 0,
    failedItems: 0,
    estimatedImageCount: pages.length,
    currentStep: "xiaohongshu_generate_started",
    items,
    images: [],
  });

  try {
    for (let index = 0; index < pages.length; index += 1) {
      await assertTaskNotCanceled(taskId);
      const page = pages[index];
      items[index] = { ...items[index], state: "running", message: "正在生成图片" };
      await updateTaskProgress(taskId, { currentStep: "generating_xhs_page", items, images });

      try {
        const pageImages = await generateXiaohongshuImages(input.plan, input.referenceImages ?? [], {
          imageAspectRatio,
          pageNumber: page.pageNumber,
        });
        images = [
          ...images.filter((image) => (image as { pageNumber?: number }).pageNumber !== page.pageNumber),
          ...pageImages,
        ].sort((left, right) => Number((left as { pageNumber?: number }).pageNumber ?? 0) - Number((right as { pageNumber?: number }).pageNumber ?? 0));
        successCount += pageImages.length;
        items[index] = { ...items[index], state: "done", message: "已生成" };
      } catch (error) {
        failedCount += 1;
        items[index] = {
          ...items[index],
          state: "failed",
          message: error instanceof Error ? error.message : "生成失败",
        };
      }

      await updateTaskProgress(taskId, {
        currentStep: "xiaohongshu_page_finished",
        totalItems: pages.length,
        completedItems: successCount,
        failedItems: failedCount,
        estimatedImageCount: pages.length,
        items,
        images,
      });
    }

    await completeTask(taskId, {
      currentStep: "xiaohongshu_generate_finished",
      totalItems: pages.length,
      completedItems: successCount,
      failedItems: failedCount,
      estimatedImageCount: pages.length,
      items,
      images,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Task canceled.") return;
    await failTask(taskId, error instanceof Error ? error.message : "Xiaohongshu generation failed", {
      currentStep: "xiaohongshu_generate_failed",
      totalItems: pages.length,
      completedItems: successCount,
      failedItems: failedCount,
      estimatedImageCount: pages.length,
      items,
      images,
    });
  }
}

export async function createXiaohongshuGenerateTask(input: XiaohongshuGenerateTaskInput, credentials: RequestProviderCredentials) {
  const systemProject = await ensureSystemTaskProject();
  const imageAspectRatio = input.imageAspectRatio ?? "3:4";
  const task = await createTask({
    projectId: systemProject.id,
    taskType: "XHS_GENERATE",
    status: "PENDING",
    inputPayload: {
      plan: input.plan,
      imageAspectRatio,
      referenceImages: input.referenceImages ?? [],
    },
    outputPayload: {
      totalItems: input.plan.pages.length,
      completedItems: 0,
      failedItems: 0,
      estimatedImageCount: input.plan.pages.length,
      currentStep: "queued",
      items: input.plan.pages.map((page) => ({ pageNumber: page.pageNumber, title: page.title, state: "pending", message: "等待生成" })),
      images: [],
    },
  });

  runTaskInBackground(() => runWithProviderCredentials(credentials, () => runXiaohongshuGenerateTask(task.id, input)));
  return getTask(task.id);
}

export async function retryWorkflowTask(taskId: string, credentials: RequestProviderCredentials) {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  if (task.status === "RUNNING") {
    throw new Error("Task is already running.");
  }

  const input = (task.inputPayload ?? {}) as Record<string, unknown>;
  await prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: "PENDING",
      errorMessage: null,
      completedAt: null,
      outputPayload: {
        ...((task.outputPayload as Record<string, unknown> | null) ?? {}),
        currentStep: "retry_queued",
      } as Prisma.InputJsonValue,
    },
  });

  if (task.taskType === "BATCH_CREATE") {
    const files = Array.isArray(input.files) ? (input.files as StoredBatchFile[]) : [];
    const autoGenerateImages = input.autoGenerateImages === true;
    runTaskInBackground(() => runWithProviderCredentials(credentials, () => runBatchCreateTask(taskId, files, autoGenerateImages)));
    return getTask(taskId);
  }

  if (task.taskType === "TRANSLATE_PAGE") {
    runTaskInBackground(() =>
      runWithProviderCredentials(credentials, () =>
        runTranslatePageTask(taskId, {
          projectId: String(input.projectId ?? task.projectId),
          targetLanguage: normalizeContentLanguage(input.targetLanguage),
          referenceAssetIds: Array.isArray(input.referenceAssetIds) ? (input.referenceAssetIds as string[]) : [],
        }),
      ),
    );
    return getTask(taskId);
  }

  if (task.taskType === "XHS_GENERATE") {
    runTaskInBackground(() =>
      runWithProviderCredentials(credentials, () =>
        runXiaohongshuGenerateTask(taskId, {
          plan: input.plan as XiaohongshuPlan,
          imageAspectRatio: input.imageAspectRatio as XiaohongshuImageAspectRatio,
          referenceImages: Array.isArray(input.referenceImages) ? (input.referenceImages as string[]) : [],
        }),
      ),
    );
    return getTask(taskId);
  }

  throw new Error("This task type does not support retry.");
}
