import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/utils/crypto";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await prisma.userProviderConfig.findUnique({
      where: { id: context.params.id },
    });
    if (!existing || existing.userId !== user.id) {
      return fail("NOT_FOUND", "配置不存在", null, 404);
    }
    await prisma.userProviderConfig.delete({ where: { id: context.params.id } });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  baseUrl: z.string().trim().url().or(z.literal("")).optional(),
  apiKey: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const existing = await prisma.userProviderConfig.findUnique({
      where: { id: context.params.id },
    });
    if (!existing || existing.userId !== user.id) {
      return fail("NOT_FOUND", "配置不存在", null, 404);
    }

    const input = patchSchema.parse(await request.json());
    const data: {
      name?: string;
      baseUrl?: string;
      isActive?: boolean;
      apiKeyEncrypted?: string;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.apiKey !== undefined) data.apiKeyEncrypted = encryptSecret(input.apiKey);

    const config = await prisma.userProviderConfig.update({
      where: { id: context.params.id },
      data,
      select: { id: true, name: true, baseUrl: true, isActive: true },
    });
    return ok(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
