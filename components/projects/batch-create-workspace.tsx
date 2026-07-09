"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Images, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ImageUploadDropzone } from "@/components/shared/image-upload-dropzone";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";

type BatchStatus = {
  fileName: string;
  state: "pending" | "running" | "done" | "failed";
  message: string;
  projectId?: string | null;
};

type TaskPayload = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELED";
  outputPayload?: {
    totalItems?: number;
    completedItems?: number;
    failedItems?: number;
    currentStep?: string;
    items?: BatchStatus[];
    projectIds?: string[];
  } | null;
  errorMessage?: string | null;
};

type ApiPayload<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPayload<T>(response: Response): Promise<ApiPayload<T>> {
  try {
    return (await response.json()) as ApiPayload<T>;
  } catch {
    return {
      success: false,
      error: { message: response.ok ? "响应解析失败" : `请求失败：${response.status}` },
    };
  }
}

export function BatchCreateWorkspace() {
  const router = useRouter();
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<BatchStatus[]>([]);
  const [autoGenerateImages, setAutoGenerateImages] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  async function pollTask(taskId: string) {
    for (;;) {
      const response = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
      const payload = await readPayload<TaskPayload>(response);
      if (!payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "读取批量任务失败");
      }

      const task = payload.data;
      const output = task.outputPayload ?? {};
      if (Array.isArray(output.items)) {
        setBatchStatuses(output.items);
      }

      if (task.status === "SUCCESS") {
        return task;
      }
      if (task.status === "FAILED" || task.status === "CANCELED") {
        throw new Error(task.errorMessage ?? (task.status === "CANCELED" ? "批量创建已取消" : "批量创建失败"));
      }

      await sleep(1800);
    }
  }

  async function handleBatchStart() {
    if (batchFiles.length === 0) {
      toast.error("请先批量上传产品图。");
      return;
    }

    setBatchSubmitting(true);
    setActiveTaskId(null);
    setBatchStatuses(
      batchFiles.map((item) => ({
        fileName: item.name,
        state: "pending",
        message: "正在准备上传",
      })),
    );

    try {
      const files = await Promise.all(batchFiles.map((file) => fileToBase64Payload(file)));
      const response = await fetch("/api/tasks/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files,
          autoGenerateImages,
        }),
      });
      const payload = await readPayload<TaskPayload>(response);
      if (!payload.success || !payload.data?.id) {
        throw new Error(payload.error?.message ?? "批量创建任务启动失败");
      }

      setActiveTaskId(payload.data.id);
      if (Array.isArray(payload.data.outputPayload?.items)) {
        setBatchStatuses(payload.data.outputPayload.items);
      }

      const finished = await pollTask(payload.data.id);
      const output = finished.outputPayload ?? {};
      const successCount = Number(output.completedItems ?? 0);
      const totalItems = Number(output.totalItems ?? batchFiles.length);
      if (successCount > 0) {
        toast.success(`批量创建完成：${successCount}/${totalItems} 个项目处理成功。`);
        router.push("/history");
      } else {
        toast.error("批量创建未完成，请检查失败原因后重试。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量创建失败");
    } finally {
      setBatchSubmitting(false);
    }
  }

  async function handleCancelTask() {
    if (!activeTaskId) return;
    await fetch(`/api/tasks/${activeTaskId}/cancel`, { method: "POST" });
    toast.message("已请求取消批量任务，当前正在执行的单步可能会先完成。 ");
  }

  const visibleStatuses =
    batchStatuses.length > 0
      ? batchStatuses
      : batchFiles.map((item) => ({
          fileName: item.name,
          state: "pending" as const,
          message: "待开始",
        }));

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white/84 p-6 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/6 md:p-8">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-white/10 dark:bg-black/30 dark:text-white">
                <Images className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">批量上传产品图</h2>
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  每张图会生成一个独立项目，并自动完成商品分析和详情页规划。
                </p>
              </div>
            </div>

            <ImageUploadDropzone
              id="batch-create-files"
              files={batchFiles}
              onFilesChange={setBatchFiles}
              acceptPagePaste
              multiple
              disabled={batchSubmitting}
              emptyIcon="images"
              title="点击、拖拽或粘贴多个产品图"
              description="支持复制文件粘贴、截图粘贴以及 JPG、PNG、WEBP；建议每张图片都是清晰主商品图。"
              minHeightClassName="min-h-[360px]"
              previewColumnsClassName="grid-cols-2 sm:grid-cols-3"
            />

            {batchFiles.length > 0 ? (
              <p className="rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-black/30 dark:text-slate-300">
                已选择 {batchFiles.length} 张图片，可点击图片区域继续替换，也可删除后重选。
              </p>
            ) : null}

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoGenerateImages}
                onChange={(event) => setAutoGenerateImages(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-slate-800 dark:text-slate-100">规划后自动生成全部模块图</span>
                <span className="mt-1 block text-xs leading-5 text-slate-400 dark:text-slate-500">会逐个调用图像模型，耗时和费用会随产品数量与模块数量增加；后台按低并发串行处理。</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={handleBatchStart}
                disabled={batchSubmitting || batchFiles.length === 0}
                className="min-w-[180px] flex-1 rounded-full"
              >
                {batchSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Images className="mr-2 h-4 w-4" />}
                {batchSubmitting ? "正在批量创建..." : "批量创建详情页"}
              </Button>
              {activeTaskId && batchSubmitting ? (
                <Button type="button" variant="outline" onClick={handleCancelTask} className="rounded-full">
                  请求取消
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white/84 p-6 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">处理进度</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                后台任务会持续更新状态；已完成项目可在历史记录中打开。
              </p>
            </div>
          </div>

          <div className="mt-5 min-h-[360px] rounded-[1.5rem] border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-black/20">
            {batchFiles.length === 0 ? (
              <div className="flex h-full min-h-[328px] items-center justify-center text-center text-sm leading-7 text-slate-400 dark:text-slate-500">
                上传后这里会显示每个文件的处理状态。
              </div>
            ) : (
              <div className="space-y-3">
                {visibleStatuses.map((item) => (
                  <div
                    key={item.fileName}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{item.fileName}</p>
                      <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">{item.message}</p>
                    </div>
                    <div className="shrink-0">
                      {item.state === "running" ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
                      {item.state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                      {item.state === "failed" ? <AlertCircle className="h-4 w-4 text-rose-500" /> : null}
                      {item.state === "pending" ? (
                        <span className="block h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
