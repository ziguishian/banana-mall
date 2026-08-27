import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assetTypeLabels, sectionTypeLabels } from "@/types/domain";

function getPreviewConfig(project: any) {
  const config = project?.modelSnapshot?.previewConfig ?? {};
  return {
    heroImageCount: Math.min(5, Math.max(1, Number(config.heroImageCount ?? 4))),
    detailSectionCount: Math.min(10, Math.max(1, Number(config.detailSectionCount ?? 6))),
  };
}

export function ExportPanel({ project }: { project: any }) {
  const previewConfig = getPreviewConfig(project);
  const galleryAssets = project.assets.filter((asset: any) => ["MAIN", "ANGLE", "DETAIL"].includes(asset.type));
  const generatedSections = project.sections.filter((section: any) => Boolean(section.imageUrl));

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>一键导出</CardTitle>
            <CardDescription>
              导出当前商品页预览中使用的全部图像，包含头图轮播和详情页模块图，同时附带导出清单。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href={`/api/projects/${project.id}/export/images`}
              className="flex rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium hover:bg-muted dark:bg-white/[0.04]"
            >
              一键导出详情页全部图像 ZIP
            </a>
            <a
              href={`/api/projects/${project.id}/export/json`}
              className="flex rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium hover:bg-muted dark:bg-white/[0.04]"
            >
              导出项目 JSON
            </a>

            <div className="rounded-3xl bg-muted/60 p-4 text-sm">
              <p className="font-medium">本次导出说明</p>
              <div className="mt-3 space-y-2 text-muted-foreground">
                <p>头图目录：按当前预览配置导出前 {previewConfig.heroImageCount} 张头图。</p>
                <p>详情目录：按当前预览配置导出前 {previewConfig.detailSectionCount} 个详情模块图。</p>
                <p>压缩包内会生成 `00-头图/`、`01-详情页/` 和 `export-manifest.json`。</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模型快照</CardTitle>
            <CardDescription>当前项目的输出配置与模型选择，仅用于核对导出上下文。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[360px] max-w-full overflow-auto rounded-2xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-200">
              {JSON.stringify(project.modelSnapshot ?? {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>当前可导出内容</CardTitle>
          <CardDescription>这里展示的是当前项目里可用于导出的头图素材和详情页模块图。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">头图候选素材</p>
              <Badge variant="outline">{galleryAssets.length} 个素材</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {galleryAssets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  暂无头图素材
                </div>
              ) : (
                galleryAssets.map((asset: any) => (
                  <div key={asset.id} className="min-w-0 rounded-2xl border border-border p-3">
                    <img src={asset.url} alt={asset.fileName} className="w-full rounded-2xl border border-border object-contain" />
                    <p className="mt-3 text-sm font-medium">
                      {assetTypeLabels[asset.type as keyof typeof assetTypeLabels] ?? asset.type}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={asset.fileName}>{asset.fileName}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">详情页模块图</p>
              <Badge variant="outline">{generatedSections.length} 个模块</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {generatedSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  暂无可导出的详情页模块图
                </div>
              ) : (
                generatedSections.map((section: any) => (
                  <div key={section.id} className="min-w-0 rounded-2xl border border-border p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={section.title}>{section.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {sectionTypeLabels[section.type.toLowerCase() as keyof typeof sectionTypeLabels] ?? section.type}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{section.status}</Badge>
                    </div>
                    {section.imageUrl ? (
                      <img src={section.imageUrl} alt={section.title} className="w-full rounded-2xl border border-border object-contain" />
                    ) : (
                      <div className="rounded-2xl bg-muted p-6 text-sm text-muted-foreground">尚未生成图像</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
