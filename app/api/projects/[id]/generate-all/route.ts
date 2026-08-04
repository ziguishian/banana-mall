import { NextRequest } from "next/server";
import { z } from "zod";

import { readProviderCredentialsFromRequest, withProviderCredentials } from "@/lib/services/provider-runtime";
import { createGenerateAllSectionsTask } from "@/lib/services/workflow-task-service";
import { handleRouteError, ok } from "@/lib/utils/route";

const requestSchema = z.object({
  mode: z.enum(["all", "missing"]).optional().default("all"),
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return withProviderCredentials(request, async () => {
    try {
      const input = requestSchema.parse(await request.json().catch(() => ({})));
      const task = await createGenerateAllSectionsTask(
        { projectId: context.params.id, mode: input.mode },
        readProviderCredentialsFromRequest(request),
      );
      return ok(task, { status: 202 });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
