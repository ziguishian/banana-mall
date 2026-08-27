import { NextRequest } from "next/server";

import { signSessionToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      return fail("INVALID_CREDENTIALS", "邮箱或密码错误。", null, 401);
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      return fail("INVALID_CREDENTIALS", "邮箱或密码错误。", null, 401);
    }

    const token = await signSessionToken({ sub: user.id, email: user.email, role: user.role });
    const response = ok({
      id: user.id,
      email: user.email,
      name: user.name,
      credits: Number(user.credits),
      role: user.role,
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
