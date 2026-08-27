import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

/**
 * 引导接口：当系统中还没有管理员时，第一个调用的登录用户可以自举为管理员。
 * 一旦存在管理员，本接口返回 409。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount > 0) {
      return ok({ alreadyExists: true, promoted: false });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: "admin" },
    });

    return ok({ alreadyExists: false, promoted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
