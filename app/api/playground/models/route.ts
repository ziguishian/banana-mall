import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getActiveProviderConfig } from "@/lib/services/provider-service";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const provider = await getActiveProviderConfig();
    const models = provider?.models ?? [];
    return ok({
      provider: provider
        ? {
            id: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
          }
        : null,
      models: models.map((model) => ({
        modelId: model.modelId,
        label: model.label || model.modelId,
        capabilities: model.capabilities,
        isDefaultPlanning: model.isDefaultPlanning,
        isDefaultHeroImage: model.isDefaultHeroImage,
        isDefaultDetailImage: model.isDefaultDetailImage,
        isDefaultImageEdit: model.isDefaultImageEdit,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
