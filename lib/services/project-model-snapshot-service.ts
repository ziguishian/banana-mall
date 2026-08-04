import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const maxSnapshotUpdateAttempts = 5;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mergeSnapshotValue(current: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return patch;
  }

  const currentRecord = asRecord(current);
  const patchRecord = patch as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...currentRecord };

  for (const [key, value] of Object.entries(patchRecord)) {
    if (value !== undefined) {
      merged[key] = mergeSnapshotValue(currentRecord[key], value);
    }
  }

  return merged;
}

export async function patchProjectModelSnapshot(projectId: string, patch: unknown) {
  const snapshotPatch = asRecord(patch);

  for (let attempt = 0; attempt < maxSnapshotUpdateAttempts; attempt += 1) {
    const current = await prisma.project.findUnique({
      where: { id: projectId },
      select: { modelSnapshot: true, updatedAt: true },
    });
    if (!current) {
      throw new Error("Project not found.");
    }

    const mergedSnapshot = mergeSnapshotValue(current.modelSnapshot, snapshotPatch) as Prisma.InputJsonValue;
    const nextUpdatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const result = await prisma.project.updateMany({
      where: {
        id: projectId,
        updatedAt: current.updatedAt,
      },
      data: {
        modelSnapshot: mergedSnapshot,
        updatedAt: nextUpdatedAt,
      },
    });

    if (result.count === 1) {
      return prisma.project.findUnique({ where: { id: projectId } });
    }
  }

  throw new Error("Project configuration changed concurrently. Please retry.");
}
