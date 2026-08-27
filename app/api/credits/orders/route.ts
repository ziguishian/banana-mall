import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amountCents: true,
        credits: true,
        status: true,
        outTradeNo: true,
        paidAt: true,
        createdAt: true,
      },
    });
    return ok(orders);
  } catch (error) {
    return handleRouteError(error);
  }
}
