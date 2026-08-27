import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

const patchSchema = z.object({
  content: z.string().trim().min(1).max(500).optional(),
  type: z.string().trim().max(40).optional(),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  publishedAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    await requireAdmin(request);
    const input = patchSchema.parse(await request.json());
    const updated = await prisma.systemAnnouncement.update({
      where: { id: context.params.id },
      data: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.type !== undefined ? { type: input.type || "default" } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.publishedAt !== undefined ? { publishedAt: new Date(input.publishedAt) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  try {
    await requireAdmin(request);
    const found = await prisma.systemAnnouncement.findUnique({ where: { id: context.params.id } });
    if (!found) return fail("NOT_FOUND", "公告不存在", null, 404);
    await prisma.systemAnnouncement.delete({ where: { id: context.params.id } });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
