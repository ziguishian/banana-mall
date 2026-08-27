import { createHash, randomInt } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getEmailConfig, sendRegisterVerificationMail } from "@/lib/email/service";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const PURPOSE = "REGISTER";

const sendCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱"),
});

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function createCode() {
  return String(randomInt(100000, 1000000));
}

export async function POST(request: NextRequest) {
  try {
    const input = sendCodeSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return fail("EMAIL_TAKEN", "该邮箱已注册，请直接登录。", null, 409);
    }

    const cfg = await getEmailConfig();
    if (!cfg.enabled) {
      return fail("EMAIL_DISABLED", "邮件发送未启用，请先在管理后台配置 SMTP。", null, 503);
    }
    if (!cfg.host || !cfg.user || !cfg.pass || !cfg.from) {
      return fail("EMAIL_CONFIG_INCOMPLETE", "SMTP 配置不完整，请检查发信邮箱设置。", null, 503);
    }

    const recent = await prisma.emailVerificationCode.findFirst({
      where: {
        email: input.email,
        purpose: PURPOSE,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      const retryAfter = Math.max(1, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000));
      return fail("CODE_TOO_FREQUENT", `请 ${retryAfter} 秒后再发送验证码。`, { retryAfter }, 429);
    }

    const code = createCode();
    await prisma.emailVerificationCode.create({
      data: {
        email: input.email,
        purpose: PURPOSE,
        codeHash: hashCode(input.email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      },
    });

    await sendRegisterVerificationMail(input.email, code);
    return ok({ sent: true, expiresIn: CODE_TTL_MINUTES * 60, cooldown: RESEND_COOLDOWN_SECONDS });
  } catch (error) {
    return handleRouteError(error);
  }
}
