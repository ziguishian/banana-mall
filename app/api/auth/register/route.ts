import { createHash } from "crypto";
import { NextRequest } from "next/server";

import { signSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sendWelcomeMail } from "@/lib/email/service";
import { env } from "@/lib/utils/env";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { registerSchema } from "@/lib/validations/auth";

const PURPOSE = "REGISTER";
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const input = registerSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return fail("EMAIL_TAKEN", "该邮箱已注册，请直接登录。", null, 409);
    }

    const verification = await prisma.emailVerificationCode.findFirst({
      where: {
        email: input.email,
        purpose: PURPOSE,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return fail("EMAIL_CODE_REQUIRED", "请先获取邮箱验证码。", null, 400);
    }

    if (verification.attempts >= MAX_ATTEMPTS) {
      return fail("EMAIL_CODE_LOCKED", "验证码错误次数过多，请重新发送验证码。", null, 429);
    }

    if (verification.codeHash !== hashCode(input.email, input.emailCode)) {
      await prisma.emailVerificationCode.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      return fail("EMAIL_CODE_INVALID", "邮箱验证码错误或已过期。", null, 400);
    }

    const passwordHash = await hashPassword(input.password);
    const bonus = env.REGISTER_BONUS_CREDITS;
    const user = await prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      });

      return tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name ?? null,
          credits: bonus,
          creditTransactions: {
            create: {
              delta: bonus,
              balanceAfter: bonus,
              reason: "REGISTER_BONUS",
            },
          },
        },
      });
    });

    sendWelcomeMail(user.email, user.name).catch((err) => {
      console.warn("[email] welcome mail failed:", err instanceof Error ? err.message : err);
    });

    const token = await signSessionToken({ sub: user.id, email: user.email, role: user.role });
    const response = ok(
      { id: user.id, email: user.email, name: user.name, credits: Number(user.credits), role: user.role },
      { status: 201 },
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
