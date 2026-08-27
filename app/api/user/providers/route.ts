import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/utils/crypto";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET() {
  try {
    const user = await requireUser();
    const configs = await prisma.userProviderConfig.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return ok(configs);
  } catch (error) {
    return handleRouteError(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  baseUrl: z.string().trim().url().or(z.literal("")),
  apiKey: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await request.json());
    const config = await prisma.userProviderConfig.create({
      data: {
        userId: user.id,
        name: input.name,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: encryptSecret(input.apiKey),
        isActive: true,
      },
      select: { id: true, name: true, baseUrl: true, isActive: true },
    });
    return ok(config, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
