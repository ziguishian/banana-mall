import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
        creditMultiplier: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            projects: true,
            orders: true,
          },
        },
      },
    });
    return ok(users.map((user) => ({ ...user, credits: Number(user.credits) })));
  } catch (error) {
    return handleRouteError(error);
  }
}

const createUserSchema = z.object({
  email: z.string().email("请输入有效邮箱"),
  password: z.string().min(6, "密码至少 6 位").max(64),
  name: z.string().trim().max(40).optional(),
  credits: z.coerce.number().min(0).max(100000).default(env.REGISTER_BONUS_CREDITS),
  creditMultiplier: z.coerce.number().min(0.01).max(100).default(1),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const input = createUserSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return fail("EMAIL_TAKEN", "该邮箱已存在", null, 409);
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name ?? null,
        credits: input.credits,
        creditMultiplier: input.creditMultiplier,
        role: input.role,
        creditTransactions:
          input.credits > 0
            ? {
                create: {
                  delta: input.credits,
                  balanceAfter: input.credits,
                  reason: "ADMIN_GRANT",
                },
              }
            : undefined,
      },
      select: { id: true, email: true, name: true, credits: true, creditMultiplier: true, role: true, createdAt: true },
    });

    console.log(`[admin] ${admin.email} 创建了用户 ${user.email}（额度=${input.credits}, 角色=${input.role}）`);
    return ok({ ...user, credits: Number(user.credits) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
