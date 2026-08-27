import { NextRequest } from "next/server";
import { z } from "zod";

import { OpenAICompatibleAdapter } from "@/lib/ai/adapters/openai-compatible";
import { requireUser } from "@/lib/auth/session";
import { assertPromptAllowed } from "@/lib/safety/sensitive-filter";
import { getActiveProviderConfig } from "@/lib/services/provider-service";
import { getRequestProviderCredentials, resolveEffectiveBaseUrl, withProviderCredentials } from "@/lib/services/provider-runtime";
import { handleRouteError, ok } from "@/lib/utils/route";

const playgroundChatSchema = z.object({
  mode: z.enum(["auto", "chat", "image"]),
  model: z.string().trim().min(1),
  message: z.string().trim().min(1).max(20000),
  images: z.array(z.string().trim().min(1)).max(8).default([]),
  size: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  return withProviderCredentials(request, async () => {
    try {
      const user = await requireUser(request);
      const input = playgroundChatSchema.parse(await request.json());
      await assertPromptAllowed(input.message, user.id);
      const activeProvider = await getActiveProviderConfig();
      const runtimeCredentials = getRequestProviderCredentials();
      const apiKey = runtimeCredentials.apiKey?.trim() ?? "";
      if (!apiKey) {
        throw new Error("操练场需要先在 AI 配置里填写当前浏览器使用的 API Key。此入口只使用你的 Key，不扣平台额度。");
      }
      const baseUrl = resolveEffectiveBaseUrl(runtimeCredentials.baseUrl || activeProvider?.baseUrl || "https://api.clawapi.me/v1");
      const adapter = new OpenAICompatibleAdapter(baseUrl, apiKey);

      if (input.mode === "image") {
        const image = await adapter.generateImage({
          model: input.model,
          prompt: input.message,
          referenceImages: input.images,
          size: input.size || "1024x1024",
          timeoutMs: 120000,
          monitor: { operation: "playground_image" },
        });
        return ok({ type: "image", image });
      }

      const result = await adapter.generateText({
        model: input.model,
        userPrompt: input.message,
        images: input.images,
        timeoutMs: 120000,
        suppressUsageLog: true,
        monitor: { operation: "playground_chat" },
      });
      return ok({ type: "text", text: result.text });
    } catch (error) {
      return handleRouteError(error);
    }
  });
}
