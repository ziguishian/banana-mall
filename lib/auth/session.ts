import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCredits } from "@/lib/credits/service";
import { HttpError } from "@/lib/utils/http-error";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";

export const SESSION_COOKIE = process.env.AUTH_COOKIE_NAME ?? "mxpage_session";

function ttlSeconds(): number {
  const raw = Number(process.env.AUTH_TOKEN_TTL_DAYS);
  const days = Number.isFinite(raw) && raw > 0 ? raw : 7;
  return 60 * 60 * 24 * days;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.AUTH_COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
};

export async function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ttlSeconds() });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export function readSessionCookie(request?: NextRequest): string | undefined {
  if (request) {
    return request.cookies.get(SESSION_COOKIE)?.value;
  }
  return cookies().get(SESSION_COOKIE)?.value;
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
};

export async function getCurrentUser(request?: NextRequest): Promise<CurrentUser | null> {
  const token = readSessionCookie(request);
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, credits: true },
  });
  if (!user) return null;
  return { ...user, credits: await getCredits(user.id) };
}

export async function requireUser(request?: NextRequest): Promise<CurrentUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "未登录或会话已过期，请重新登录。");
  }
  return user;
}

export async function requireAdmin(request?: NextRequest): Promise<CurrentUser> {
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new HttpError(403, "FORBIDDEN", "需要管理员权限。");
  }
  return user;
}
