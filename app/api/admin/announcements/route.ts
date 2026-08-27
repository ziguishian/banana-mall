import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

const announcementSchema = z.object({
  content: z.string().trim().min(1, "公告内容不能为空").max(500),
  type: z.string().trim().max(40).default("default"),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  publishedAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const announcements = await prisma.systemAnnouncement.findMany({
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
    return ok(announcements);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const input = announcementSchema.parse(await request.json());
    const announcement = await prisma.systemAnnouncement.create({
      data: {
        content: input.content,
        type: input.type || "default",
        description: input.description || null,
        isActive: input.isActive,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date(),
      },
    });
    return ok(announcement, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
