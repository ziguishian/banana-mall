"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadDropzone } from "@/components/shared/image-upload-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fileToBase64Payload } from "@/lib/utils/base64-upload";
import { assetTypeLabels, platformLabels, platformOptions, styleLabels, styleOptions } from "@/types/domain";
import { projectCreateSchema } from "@/lib/validations/project";

type ProjectCreateValues = z.input<typeof projectCreateSchema>;
type UploadBucketKey = "MAIN" | "ANGLE" | "DETAIL" | "REFERENCE";
type UploadBuckets = Record<UploadBucketKey, File[]>;

export function ProjectCreator() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [uploads, setUploads] = useState<UploadBuckets>({
    MAIN: [],
    ANGLE: [],
    DETAIL: [],
    REFERENCE: [],
  });

  const form = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: "",
      platform: "general_ecommerce",
      style: "generic_clean",
      description: "",
    },
  });

  const assetGroups = useMemo(
    () =>
      [
        {
          type: "MAIN" as const,
          label: assetTypeLabels.MAIN,
          hint: "必填。至少上传 1 张主商品图，AI 会以它为核心分析商品。",
          multiple: false,
          required: true,
        },
        {
          type: "ANGLE" as const,
          label: assetTypeLabels.ANGLE,
          hint: "选填。未上传时，后续可由 AI 自动补充角度表现。",
          multiple: true,
          required: false,
        },
        {
          type: "DETAIL" as const,
          label: assetTypeLabels.DETAIL,
          hint: "选填。未上传时，后续可由 AI 自动补充细节表现。",
          multiple: true,
          required: false,
        },
        {
          type: "REFERENCE" as const,
          label: assetTypeLabels.REFERENCE,
          hint: "选填。用于约束风格或构图，不会自动替代主商品信息。",
          multiple: true,
          required: false,
        },
      ],
    [],
  );

  const updateBucket = (type: UploadBucketKey, files: File[]) => {
    setUploads((current) => ({
      ...current,
      [type]: files,
    }));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (uploads.MAIN.length === 0) {
      toast.error("请至少上传 1 张主商品图");
      return;
    }

    setSubmitting(true);
    try {
      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const createdPayload = await createResponse.json();
      if (!createdPayload.success) throw new Error(createdPayload.error?.message ?? "创建项目失败");

      const projectId = createdPayload.data.id as string;

      for (const [type, files] of Object.entries(uploads) as Array<[UploadBucketKey, File[]]>) {
        for (const file of files) {
          const base64Payload = await fileToBase64Payload(file);
          const uploadResponse = await fetch(`/api/projects/${projectId}/assets/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              ...base64Payload,
            }),
          });
          const uploadPayload = await uploadResponse.json();
          if (!uploadPayload.success) {
            throw new Error(uploadPayload.error?.message ?? `${file.name} 上传失败`);
          }
        }
      }

      toast.success("项目已创建");
      router.push(`/projects/${projectId}/analysis`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>新建商品项目</CardTitle>
        <CardDescription>创建项目后会自动跳转到分析页，继续完成 AI 结构化解析与 section 规划。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>项目名称</Label>
            <Input {...form.register("name")} placeholder="例如：蕉感绒毛毯 2026 春季主推款" />
          </div>
          <div className="space-y-2">
            <Label>平台</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm" {...form.register("platform")}>
              {platformOptions.map((option) => (
                <option key={option} value={option}>
                  {platformLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>风格</Label>
            <select className="flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm" {...form.register("style")}>
              {styleOptions.map((option) => (
                <option key={option} value={option}>
                  {styleLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>备注</Label>
            <Textarea {...form.register("description")} placeholder="补充平台策略、目标客群、投放目标等信息" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {assetGroups.map((group) => (
            <div key={group.type} className="space-y-3 rounded-3xl border border-dashed border-border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label>{group.label}</Label>
                  <span className={`text-xs ${group.required ? "text-rose-500" : "text-muted-foreground"}`}>
                    {group.required ? "必填" : "选填"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{group.hint}</p>
              </div>

              <ImageUploadDropzone
                id={`project-create-${group.type.toLowerCase()}-files`}
                files={uploads[group.type]}
                onFilesChange={(files) => updateBucket(group.type, files)}
                acceptPagePaste={group.type === "MAIN"}
                multiple={group.multiple}
                disabled={submitting}
                emptyIcon="images"
                title={group.multiple ? "点击、拖拽或粘贴上传图片" : "点击、拖拽或粘贴上传主图"}
                description="支持复制文件粘贴、截图粘贴以及 JPG、PNG、WEBP。"
                minHeightClassName="min-h-[160px]"
                previewColumnsClassName="grid-cols-2"
              />
            </div>
          ))}
        </div>

        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          创建项目并上传素材
        </Button>
      </CardContent>
    </Card>
  );
}
