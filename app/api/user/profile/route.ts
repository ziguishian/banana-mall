import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

const updateProfileSchema = z.object({
  name: z.string().trim().max(40, "用户名最多 40 个字符").optional(),
});

function selectUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const profile = await selectUser(user.id);
    return ok(profile ? { ...profile, credits: Number(profile.credits) } : null);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = updateProfileSchema.parse(await request.json());
    await prisma.user.update({
      where: { id: user.id },
      data: { name: input.name || null },
    });
    const profile = await selectUser(user.id);
    return ok(profile ? { ...profile, credits: Number(profile.credits) } : null);
  } catch (error) {
    return handleRouteError(error);
  }
}
