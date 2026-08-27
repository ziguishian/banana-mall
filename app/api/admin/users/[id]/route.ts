import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

const patchSchema = z.object({
  name: z.string().trim().max(40).optional(),
  credits: z.coerce.number().min(0).max(1000000).optional(),
  creditMultiplier: z.coerce.number().min(0.01).max(100).optional(),
  role: z.enum(["user", "admin"]).optional(),
  // 额度调整（增量，正负均可），优先于 credits 绝对值
  creditDelta: z.coerce.number().min(-1000000).max(1000000).optional(),
  reason: z.string().max(200).optional(),
});

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request);
    const input = patchSchema.parse(await request.json());

    const target = await prisma.user.findUnique({ where: { id: context.params.id } });
    if (!target) {
      return fail("NOT_FOUND", "用户不存在", null, 404);
    }

    // 不允许管理员降级自己（避免误锁）
    if (input.role === "user" && target.id === admin.id) {
      return fail("FORBIDDEN", "不能降级自己的管理员权限", null, 403);
    }

    const data: {
      name?: string;
      credits?: number;
      creditMultiplier?: number;
      role?: string;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.creditMultiplier !== undefined) data.creditMultiplier = input.creditMultiplier;
    if (input.role !== undefined) data.role = input.role;

    // 额度处理：creditDelta 优先，否则直接设置 credits
    const currentCredits = Number(target.credits);
    let balanceAfter: number | undefined;
    let delta: number | undefined;
    if (input.creditDelta !== undefined && input.creditDelta !== 0) {
      const next = Math.max(0, currentCredits + input.creditDelta);
      delta = next - currentCredits;
      balanceAfter = next;
      data.credits = next;
    } else if (input.credits !== undefined && input.credits !== currentCredits) {
      delta = input.credits - currentCredits;
      balanceAfter = input.credits;
      data.credits = input.credits;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id: target.id }, data });
      }
      if (delta !== undefined && balanceAfter !== undefined && delta !== 0) {
        await tx.creditTransaction.create({
          data: {
            userId: target.id,
            delta,
            balanceAfter,
            reason: input.reason || (delta > 0 ? "ADMIN_GRANT" : "ADMIN_DEDUCT"),
          },
        });
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: target.id },
      select: { id: true, email: true, name: true, credits: true, creditMultiplier: true, role: true, updatedAt: true },
    });
    return ok(updated ? { ...updated, credits: Number(updated.credits) } : null);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request);
    const target = await prisma.user.findUnique({ where: { id: context.params.id } });
    if (!target) {
      return fail("NOT_FOUND", "用户不存在", null, 404);
    }
    if (target.id === admin.id) {
      return fail("FORBIDDEN", "不能删除自己", null, 403);
    }
    if (target.role === "admin") {
      // 删除最后一个管理员会导致系统锁死，需拦截
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return fail("FORBIDDEN", "系统至少需要保留一个管理员", null, 403);
      }
    }

    await prisma.user.delete({ where: { id: target.id } });
    console.log(`[admin] ${admin.email} 删除了用户 ${target.email}`);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
