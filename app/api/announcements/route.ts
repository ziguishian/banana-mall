import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const announcements = await prisma.systemAnnouncement.findMany({
      where: { isActive: true, publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: "desc" },
      take: 20,
      include: {
        states: {
          where: { userId: user.id },
          take: 1,
        },
      },
    });
    const today = todayKey();
    const visible = announcements.filter((item) => item.states[0]?.closedDate !== today);
    const unreadCount = announcements.filter((item) => !item.states[0]?.readAt).length;
    return ok({
      unreadCount,
      announcements: visible.map(({ states, ...item }) => ({
        ...item,
        readAt: states[0]?.readAt ?? null,
        closedDate: states[0]?.closedDate ?? null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
