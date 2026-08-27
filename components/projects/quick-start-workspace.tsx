"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";
import { pickFirstImageFile, pickFirstImageFromClipboardItems } from "@/lib/utils/image-file-selection";

function buildDraftProjectName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];

  return `未命名商品项目-${parts.join("")}`;
}

export function QuickStartWorkspace() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const selectImageFile = useCallback((nextFile: File | null) => {
    if (!nextFile) {
      toast.error("请上传 JPG、PNG、WEBP 等图片文件。");
      return;
    }

    setFile(nextFile);
  }, []);

  const handleFileChange = (fileList: FileList | null) => {
    selectImageFile(pickFirstImageFile(fileList));
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    if (submitting) {
      return;
    }

    selectImageFile(pickFirstImageFile(event.dataTransfer.files));
  };

  const handlePaste = useCallback(
    (event: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
      if (submitting) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const nextFile =
        pickFirstImageFile(clipboardData.files) ?? pickFirstImageFromClipboardItems(clipboardData.items);

      if (!nextFile) {
        return;
      }

      event.preventDefault();
      selectImageFile(nextFile);
    },
    [selectImageFile, submitting],
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  const handleStart = async () => {
    if (!file) {
      toast.error("请先上传 1 张主商品图。");
      return;
    }

    setSubmitting(true);

    try {
      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buildDraftProjectName(),
          platform: "general_ecommerce",
          style: "generic_clean",
          description: "由首页快速开始自动创建",
        }),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) {
        throw new Error(createdPayload.error?.message ?? "创建项目失败");
      }

      const projectId = createdPayload.data.id as string;
      const base64Payload = await fileToBase64Payload(file);

      const uploadResponse = await fetch(`/api/projects/${projectId}/assets/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MAIN",
          ...base64Payload,
        }),
      });
      const uploadPayload = await uploadResponse.json();
      if (!uploadPayload.success) {
        throw new Error(uploadPayload.error?.message ?? "主商品图上传失败");
      }

      const analyzeResponse = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const analyzePayload = await analyzeResponse.json();

      if (!analyzePayload.success) {
        const rawErrorCode = String(analyzePayload.error?.code ?? "");
        const shouldAutoRetry = rawErrorCode === "PROVIDER_TIMEOUT";
        const errorCode = encodeURIComponent(rawErrorCode);
        const errorMessage = encodeURIComponent(
          String(analyzePayload.error?.message ?? "主图已上传，但自动分析未完成。"),
        );

        toast.warning(
          shouldAutoRetry
            ? "主图已上传，正在为你跳转到分析页继续自动重试。"
            : "主图已上传，已为你跳转到分析页继续处理。",
        );

        router.push(
          `/projects/${projectId}/analysis?source=quick-start${shouldAutoRetry ? "&autoRun=1" : ""}&analysisErrorCode=${errorCode}&analysisErrorMessage=${errorMessage}`,
        );
        return;
      }

      toast.success("主图上传完成，AI 已自动完成首轮分析。");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快速开始失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-11rem)] max-w-6xl flex-col space-y-8">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950 dark:text-white md:text-5xl">
          上传产品图片
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500 dark:text-slate-400">
          上传一张产品白底图，AI 将自动分析产品信息
        </p>
      </div>

      <div className="flex min-h-0 flex-1 rounded-[2rem] border border-slate-200 bg-white/84 p-6 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/6 md:p-10">
        <div
          className={`flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-dashed p-6 transition dark:bg-white/[0.03] md:p-12 ${
            dragging
              ? "border-slate-900 bg-slate-50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.2)] dark:border-white/40 dark:bg-white/[0.06]"
              : "border-slate-300 bg-white/50 dark:border-white/10"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!submitting) {
              setDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!submitting) {
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setDragging(false);
          }}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          <Input
            ref={fileInputRef}
            id="quick-start-file"
            type="file"
            accept="image/*"
            onChange={(event) => handleFileChange(event.target.files)}
            className="hidden"
          />

          <div
            role="button"
            tabIndex={0}
            className="flex min-h-[420px] flex-1 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] transition hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-4 dark:hover:bg-white/[0.04] dark:focus-visible:ring-white dark:focus-visible:ring-offset-slate-950"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {previewUrl ? (
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-[min(78vw,340px)] overflow-hidden rounded-[1.5rem] bg-slate-100 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.42)] dark:bg-white/8 md:w-[420px] xl:w-[460px]">
                  <button
                    type="button"
                    aria-label="删除已上传图片"
                    className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-700 shadow-lg transition hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-black/70 dark:text-slate-200 dark:hover:text-red-300"
                    disabled={submitting}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveFile();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="aspect-square">
                    <img src={previewUrl} alt={file?.name ?? "主商品图预览"} className="h-full w-full object-contain" />
                  </div>
                </div>

                <div className="mt-6 space-y-2 text-center">
                  {submitting ? (
                    <div className="inline-flex items-center gap-2 text-lg text-slate-400 dark:text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>正在分析产品...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">已选择产品图</p>
                      <p className="max-w-md truncate text-sm text-slate-400 dark:text-slate-500">{file?.name}</p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">点击图片可重新选择，也可拖拽或粘贴替换</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-white/10 dark:bg-black/30 dark:text-white">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <p className="mt-6 text-lg font-medium text-slate-900 dark:text-white">点击、拖拽或粘贴上传产品图片</p>
                <p className="mt-2 text-sm leading-7 text-slate-400 dark:text-slate-500">
                  支持复制文件粘贴、截图粘贴，建议使用清晰的白底主图
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <Button onClick={handleStart} disabled={submitting || !file} className="min-w-[220px] rounded-full px-8">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {submitting ? "正在上传并自动分析…" : "开始分析"}
            </Button>
          </div>
        </div>
      </div>

    </section>
  );
}
