import { NextRequest } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "密码至少需要 8 个字符").max(64, "密码最多 64 个字符"),
    confirmPassword: z.string().min(1, "请确认新密码"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的新密码不一致",
  });

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = changePasswordSchema.parse(await request.json());
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser) {
      return fail("NOT_FOUND", "用户不存在", null, 404);
    }

    const valid = await verifyPassword(input.currentPassword, dbUser.passwordHash);
    if (!valid) {
      return fail("INVALID_PASSWORD", "当前密码不正确", null, 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });

    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
