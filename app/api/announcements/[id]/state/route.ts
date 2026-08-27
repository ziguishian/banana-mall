import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

const stateSchema = z.object({
  action: z.enum(["read", "close_today"]),
});

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser(request);
    const input = stateSchema.parse(await request.json());
    const now = new Date();
    const state = await prisma.userAnnouncementState.upsert({
      where: {
        userId_announcementId: {
          userId: user.id,
          announcementId: context.params.id,
        },
      },
      create: {
        userId: user.id,
        announcementId: context.params.id,
        readAt: now,
        closedDate: input.action === "close_today" ? todayKey() : null,
      },
      update: {
        readAt: now,
        ...(input.action === "close_today" ? { closedDate: todayKey() } : {}),
      },
    });
    return ok(state);
  } catch (error) {
    return handleRouteError(error);
  }
}
