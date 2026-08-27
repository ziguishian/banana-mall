import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({
      where: { id: context.params.id },
      select: {
        id: true,
        amountCents: true,
        credits: true,
        status: true,
        outTradeNo: true,
        qrcodeUrl: true,
        payUrl: true,
        paidAt: true,
        createdAt: true,
      },
    });
    if (!order) {
      return fail("NOT_FOUND", "订单不存在", null, 404);
    }
    // 仅允许查询自己的订单
    const own = await prisma.order.findUnique({ where: { id: context.params.id }, select: { userId: true } });
    if (!own || own.userId !== user.id) {
      return fail("FORBIDDEN", "无权访问该订单", null, 403);
    }
    return ok(order);
  } catch (error) {
    return handleRouteError(error);
  }
}
