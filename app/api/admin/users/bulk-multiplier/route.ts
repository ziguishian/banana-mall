import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleRouteError, ok } from "@/lib/utils/route";

const bulkMultiplierSchema = z.object({
  creditMultiplier: z.coerce.number().min(0.01).max(100),
});

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const input = bulkMultiplierSchema.parse(await request.json());
    const result = await prisma.user.updateMany({
      data: { creditMultiplier: input.creditMultiplier },
    });
    return ok({ count: result.count, creditMultiplier: input.creditMultiplier });
  } catch (error) {
    return handleRouteError(error);
  }
}
