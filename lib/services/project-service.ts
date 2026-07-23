import fs from "fs/promises";
import path from "path";

import { prisma } from "@/lib/db/prisma";
import { assetPublicUrl, deleteAssetRecord } from "@/lib/storage/asset-manager";
import { env } from "@/lib/utils/env";

function readPreviewConfig(snapshot: unknown) {
  const data = (snapshot as Record<string, unknown> | null) ?? {};
  const previewConfig = (data.previewConfig as Record<string, unknown> | null) ?? {};

  return {
    heroImageCount: Math.min(5, Math.max(1, Number(previewConfig.heroImageCount ?? 4))),
    detailSectionCount: Math.min(10, Math.max(1, Number(previewConfig.detailSectionCount ?? 6))),
  };
}

async function deleteAssetIfUnreferenced(assetId: string | null | undefined) {
  if (!assetId) {
    return;
  }

  const versionRefCount = await prisma.sectionVersion.count({
    where: { imageAssetId: assetId },
  });
  const currentRefCount = await prisma.pageSection.count({
    where: { currentImageAssetId: assetId },
  });

  if (versionRefCount === 0 && currentRefCount === 0) {
    await deleteAssetRecord(assetId);
  }
}

async function normalizeSectionOrder(projectId: string) {
  const sections = await prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  await prisma.$transaction(
    sections.map((section, index) =>
      prisma.pageSection.update({
        where: { id: section.id },
        data: { order: index },
      }),
    ),
  );
}

async function pruneProjectToPreviewConfig(projectId: string, snapshot: unknown) {
  const previewConfig = readPreviewConfig(snapshot);
  const sections = await prisma.pageSection.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          imageAsset: true,
        },
      },
      generatedAssets: true,
    },
  });

  const removableSections = [
    ...sections.filter((section) => section.type === "HERO").slice(previewConfig.heroImageCount),
    ...sections.filter((section) => section.type !== "HERO").slice(previewConfig.detailSectionCount),
  ];

  for (const section of removableSections) {
    const assetIds = [
      ...new Set(
        [
          section.currentImageAssetId,
          ...section.versions.map((version) => version.imageAssetId),
          ...section.generatedAssets.map((asset) => asset.id),
        ].filter(Boolean),
      ),
    ] as string[];

    await prisma.pageSection.delete({
      where: { id: section.id },
    });

    for (const assetId of assetIds) {
      await deleteAssetIfUnreferenced(assetId);
    }
  }

  if (removableSections.length > 0) {
    await normalizeSectionOrder(projectId);
  }
}

export async function listProjects() {
  const projects = await prisma.project.findMany({
    where: { platform: { not: "__mxpage_system_task__" } },
    orderBy: { updatedAt: "desc" },
    include: {
      assets: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      sections: true,
    },
  });

  return projects.map((project) => ({
    ...project,
    coverImageUrl: assetPublicUrl(project.assets[0]),
    sectionCount: project.sections.length,
  }));
}

export async function createProject(input: {
  name: string;
  platform: string;
  style: string;
  description?: string | null;
}) {
  return prisma.project.create({
    data: input,
  });
}

export async function getProjectDetail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      analysis: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          currentImageAsset: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            include: {
              imageAsset: true,
            },
          },
        },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    ...project,
    assets: project.assets.map((asset) => ({
      ...asset,
      url: assetPublicUrl(asset),
    })),
    sections: project.sections.map((section) => ({
      ...section,
      imageUrl: assetPublicUrl(section.currentImageAsset),
      versions: section.versions.map((version) => ({
        ...version,
        imageUrl: assetPublicUrl(version.imageAsset),
      })),
    })),
  };
}

export async function updateProject(projectId: string, input: Record<string, unknown>) {
  await prisma.project.update({
    where: { id: projectId },
    data: input,
  });

  if ("modelSnapshot" in input) {
    await pruneProjectToPreviewConfig(projectId, input.modelSnapshot);
  }

  return getProjectDetail(projectId);
}

export async function deleteProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return null;
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  const storageRoot = path.resolve(process.cwd(), env.STORAGE_ROOT);
  await Promise.all([
    fs.rm(path.join(storageRoot, "uploads", projectId), { recursive: true, force: true }),
    fs.rm(path.join(storageRoot, "generated", projectId), { recursive: true, force: true }),
    fs.rm(path.join(storageRoot, "exports", projectId), { recursive: true, force: true }),
  ]);

  return project;
}
