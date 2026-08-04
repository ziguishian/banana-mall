import { z } from "zod";

import type {
  AiMonitorContext,
  ChatMessage,
  ImageEditRequest,
  ImageGenerationRequest,
  ImageGenerationResult,
  ProviderAdapter,
  StructuredRequest,
  TextRequest,
} from "@/lib/ai/provider-client";
import { inferCategory, logApiUsage } from "@/lib/monitor/api-usage";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function hasOpenAiVersionSuffix(baseUrl: string) {
  return /\/v\d+(?:beta)?$/i.test(normalizeBaseUrl(baseUrl));
}

function buildOpenAiCompatibleUrls(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const urls = [];

  if (!hasOpenAiVersionSuffix(normalized)) {
    urls.push(`${normalized}/v1${path}`);
  }

  urls.push(`${normalized}${path}`);

  return [...new Set(urls)];
}

function baseUrlFromRequestUrl(url: string, path: string) {
  return url.endsWith(path) ? normalizeBaseUrl(url.slice(0, -path.length)) : null;
}

function shouldRetryWithVersionedBase(status: number, body: string) {
  return status === 404 || status === 405 || /not found|no route|cannot\s+(get|post)|unsupported endpoint/i.test(body);
}

function isGeminiImageModel(model: string) {
  return /gemini.*image|nano-banana|banana/i.test(model);
}

function isOpenAiGptImageModel(model: string) {
  return /(?:^|[-_\s])gpt[-_\s]?image(?:[-_\s]?(?:\d+(?:\.\d+)?|mini))?|chatgpt-image/i.test(model);
}

function deriveGoogleBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);

  if (/\/google(?:\/.*)?$/i.test(normalized)) {
    return normalized.replace(/\/(v1|v1beta)$/i, "");
  }

  if (/\/v1(?:beta)?$/i.test(normalized)) {
    return normalized.replace(/\/v1(?:beta)?$/i, "/google");
  }

  return `${normalized}/google`;
}

function sizeToAspectRatio(size?: string) {
  switch (size) {
    case "3:4":
      return "3:4";
    case "9:16":
      return "9:16";
    case "1024x1536":
      return "2:3";
    case "1536x1024":
      return "3:2";
    case "1024x1024":
      return "1:1";
    default:
      return "9:16";
  }
}

function resolveAspectRatio(input: { aspectRatio?: "1:1" | "3:4" | "9:16"; size?: string }) {
  if (input.aspectRatio) {
    return input.aspectRatio;
  }

  return sizeToAspectRatio(input.size);
}

function resolveOpenAiSize(input: { aspectRatio?: "1:1" | "3:4" | "9:16"; size?: string }) {
  if (input.size) {
    return input.size;
  }

  if (input.aspectRatio === "1:1") {
    return "1024x1024";
  }

  if (input.aspectRatio === "3:4" || input.aspectRatio === "9:16") {
    return "1024x1536";
  }

  return "1024x1536";
}

function dataUrlToInlineData(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid base64 image data URL.");
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

function dataUrlToBlob(dataUrl: string) {
  const inlineData = dataUrlToInlineData(dataUrl);
  return new Blob([Buffer.from(inlineData.data, "base64")], {
    type: inlineData.mimeType,
  });
}

function extractTextContent(payload: unknown) {
  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    return message
      .map((entry) =>
        typeof entry === "object" && entry && "text" in entry ? String(entry.text ?? "") : "",
      )
      .join("\n")
      .trim();
  }

  return "";
}

function parseJsonBlock(raw: string) {
  const direct = raw.trim();
  if (direct.startsWith("{") || direct.startsWith("[")) {
    return direct;
  }

  const fencedMatch = direct.match(/```json([\s\S]*?)```/i) || direct.match(/```([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = direct.indexOf("{");
  const lastBrace = direct.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return direct.slice(firstBrace, lastBrace + 1);
  }

  return direct;
}

function tryParseJsonBody(body: RequestInit["body"]) {
  if (typeof body !== "string") {
    return null;
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tryReadBodyModel(body: RequestInit["body"]) {
  const jsonPayload = tryParseJsonBody(body);
  if (typeof jsonPayload?.model === "string") {
    return jsonPayload.model;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const model = body.get("model");
    return typeof model === "string" ? model : null;
  }

  return null;
}

function inferModelFromEndpoint(url: string, bodyPayload?: Record<string, unknown> | null) {
  if (typeof bodyPayload?.model === "string") {
    return bodyPayload.model;
  }

  const match = url.match(/\/models\/([^:\/]+):generateContent/i);
  return match?.[1] ?? null;
}

function readMonitorContext(input?: AiMonitorContext) {
  return {
    projectId: input?.projectId ?? null,
    sectionId: input?.sectionId ?? null,
    operation: input?.operation ?? null,
  };
}

function tryParseStructuredPayload<T>(raw: string, schema: z.ZodType<T>) {
  const parsedJson = JSON.parse(parseJsonBlock(raw));
  return schema.parse(parsedJson);
}

function isUnsupportedTemperatureError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /temperature/i.test(error.message) && /unsupported|does not support|only the default|unsupported_value/i.test(error.message);
}

function omitTemperature<T extends Record<string, unknown>>(body: T) {
  const { temperature: _temperature, ...rest } = body;
  return rest;
}

function shouldOmitTemperatureForModel(model: string) {
  return /^gpt-5/i.test(model);
}

function withOptionalTemperature<T extends Record<string, unknown>>(model: string, body: T, temperature: number) {
  return shouldOmitTemperatureForModel(model) ? body : { ...body, temperature };
}

function buildMessages(input: TextRequest | StructuredRequest<unknown>): ChatMessage[] {
  const content: ChatMessage["content"] =
    input.images?.length
      ? [
          { type: "text", text: input.userPrompt },
          ...input.images.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ]
      : input.userPrompt;

  const messages: ChatMessage[] = [];
  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }
  messages.push({ role: "user", content });
  return messages;
}

function extractImageResult(payload: {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
}): ImageGenerationResult {
  const result = payload.data?.[0];
  if (!result) {
    throw new Error("Image generation returned no data.");
  }

  return {
    url: result.url ?? null,
    b64Json: result.b64_json ?? null,
    revisedPrompt: result.revised_prompt ?? null,
  };
}

function extractGoogleImageResult(payload: any): ImageGenerationResult {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];

  for (const part of parts) {
    const inlineData = part?.inlineData ?? part?.inline_data ?? null;
    if (inlineData?.data) {
      return {
        url: null,
        b64Json: String(inlineData.data),
        revisedPrompt: typeof part?.text === "string" ? part.text : null,
      };
    }
  }

  throw new Error("Google image generation returned no inline image data.");
}

function toImageRefs(images: string[]) {
  return images.map((imageUrl) => ({
    image_url: imageUrl,
  }));
}

function toMaskRef(mask: string) {
  return {
    image_url: mask,
  };
}

function classifyProbeResult(status: number, body: string) {
  if (/model.+does not exist|does not exist|invalid_value.+model|param.+model|unsupported model/i.test(body)) {
    return "unavailable" as const;
  }
  if (/no available endpoint|not found|404/i.test(body) || status === 404) {
    return "unavailable" as const;
  }
  if (status === 429 || /限流|rate limit/i.test(body)) {
    return "rate_limited" as const;
  }
  if (/invalid value.+size|supported values|images\[0\]|unknown parameter|invalid type|aspectratio/i.test(body)) {
    return "available" as const;
  }
  if (status === 401 || status === 403) {
    return "unknown" as const;
  }
  if (status === 400 || status === 200) {
    return "available" as const;
  }
  return "unknown" as const;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  private preferredBaseUrl: string | null = null;

  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private buildRequestUrls(path: string) {
    const urls = buildOpenAiCompatibleUrls(this.baseUrl, path);
    if (!this.preferredBaseUrl) {
      return urls;
    }

    const preferredUrl = `${this.preferredBaseUrl}${path}`;
    return [preferredUrl, ...urls.filter((url) => url !== preferredUrl)];
  }

  private rememberCompatibleBaseUrl(url: string, path: string, response: { ok: boolean; status: number; body: string }) {
    if (!response.ok && shouldRetryWithVersionedBase(response.status, response.body)) {
      return;
    }

    this.preferredBaseUrl = baseUrlFromRequestUrl(url, path) ?? this.preferredBaseUrl;
  }

  private async fetchRaw(
    url: string,
    init?: RequestInit,
    extraHeaders?: Record<string, string>,
    timeoutMs = 15000,
    monitor?: AiMonitorContext,
    options?: {
      suppressUsageLog?: boolean;
    },
  ) {
    const controller = new AbortController();
    const externalSignal = init?.signal;
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) {
      abortFromExternalSignal();
    } else {
      externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const method = init?.method ?? "GET";
    const bodyPayload = tryParseJsonBody(init?.body);
    const model = tryReadBodyModel(init?.body) ?? inferModelFromEndpoint(url, bodyPayload);
    const category = inferCategory(url, bodyPayload);
    const requestBytes = typeof init?.body === "string" ? Buffer.byteLength(init.body) : 0;

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(typeof FormData !== "undefined" && init?.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${this.apiKey}`,
          ...(extraHeaders ?? {}),
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const body = await response.text();
      if (!options?.suppressUsageLog) {
        await logApiUsage({
          providerBaseUrl: normalizeBaseUrl(this.baseUrl),
          endpoint: url,
          method,
          model,
          ...readMonitorContext(monitor),
          category,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
          success: response.ok,
          requestBytes,
          responseBytes: Buffer.byteLength(body),
          responseBody: body,
          errorMessage: response.ok ? null : body.slice(0, 1000),
        });
      }
      return {
        ok: response.ok,
        status: response.status,
        body,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (!options?.suppressUsageLog) {
        await logApiUsage({
          providerBaseUrl: normalizeBaseUrl(this.baseUrl),
          endpoint: url,
          method,
          model,
          ...readMonitorContext(monitor),
          category,
          statusCode: 0,
          durationMs: Date.now() - startedAt,
          success: false,
          requestBytes,
          responseBytes: 0,
          responseBody: "",
          errorMessage: error instanceof Error ? error.message : "Unknown request failure",
        });
      }

      if ((error as Error)?.name === "AbortError") {
        if (externalSignal?.aborted) {
          throw new Error("Task canceled.");
        }
        throw new Error(`Provider request timed out after ${timeoutMs}ms: ${url}`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  private async requestRaw(
    path: string,
    init?: RequestInit,
    timeoutMs?: number,
    monitor?: AiMonitorContext,
    options?: {
      suppressUsageLog?: boolean;
    },
  ) {
    const urls = this.buildRequestUrls(path);
    if (urls.length === 1 || options?.suppressUsageLog) {
      const response = await this.fetchRaw(urls[0], init, undefined, timeoutMs, monitor, options);
      this.rememberCompatibleBaseUrl(urls[0], path, response);
      return response;
    }

    const startedAt = Date.now();
    const method = init?.method ?? "GET";
    const bodyPayload = tryParseJsonBody(init?.body);
    const requestBytes = typeof init?.body === "string" ? Buffer.byteLength(init.body) : 0;
    const collapsedAttempts: Array<{
      endpoint: string;
      statusCode: number;
      success: boolean;
      errorMessage: string | null;
    }> = [];
    let lastResponse: Awaited<ReturnType<typeof this.fetchRaw>> | null = null;
    let lastUrl = urls[0];
    let lastError: unknown = null;

    for (const url of urls) {
      try {
        const response = await this.fetchRaw(
          url,
          init,
          undefined,
          timeoutMs,
          monitor,
          {
            ...options,
            suppressUsageLog: true,
          },
        );
        lastResponse = response;
        lastUrl = url;
        collapsedAttempts.push({
          endpoint: url,
          statusCode: response.status,
          success: response.ok,
          errorMessage: response.ok ? null : response.body.slice(0, 1000),
        });

        this.rememberCompatibleBaseUrl(url, path, response);

        if (response.ok || !shouldRetryWithVersionedBase(response.status, response.body)) {
          break;
        }
      } catch (error) {
        lastError = error;
        lastUrl = url;
        collapsedAttempts.push({
          endpoint: url,
          statusCode: 0,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown request failure",
        });
        break;
      }
    }

    const finalResponse =
      lastError && (!lastResponse || shouldRetryWithVersionedBase(lastResponse.status, lastResponse.body))
        ? {
            ok: false,
            status: 0,
            body: lastError instanceof Error ? lastError.message : "Unknown request failure",
            durationMs: Date.now() - startedAt,
          }
        : lastResponse ?? {
        ok: false,
        status: 0,
        body: "",
        durationMs: Date.now() - startedAt,
      };
    const retrySummary =
      collapsedAttempts.length > 1
        ? collapsedAttempts
            .filter((item) => !item.success)
            .map((item) => `${item.endpoint} -> ${item.statusCode}: ${item.errorMessage ?? "Unknown error"}`)
            .join(" | ")
        : null;

    await logApiUsage({
      providerBaseUrl: normalizeBaseUrl(this.baseUrl),
      endpoint: urls[0],
      finalEndpoint: lastUrl,
      method,
      model: tryReadBodyModel(init?.body) ?? inferModelFromEndpoint(lastUrl, bodyPayload),
      ...readMonitorContext(monitor),
      category: inferCategory(lastUrl, bodyPayload),
      statusCode: finalResponse.status,
      durationMs: Date.now() - startedAt,
      success: finalResponse.ok,
      requestBytes,
      responseBytes: Buffer.byteLength(finalResponse.body),
      responseBody: finalResponse.body,
      attemptCount: collapsedAttempts.length,
      retrySummary,
      collapsedAttempts,
      errorMessage: finalResponse.ok
        ? null
        : finalResponse.body.slice(0, 1000) ||
          (lastError instanceof Error ? lastError.message : "Unknown request failure"),
    });

    if (!lastResponse && lastError) {
      if ((lastError as Error)?.name === "AbortError") {
        throw new Error(`Provider request timed out after ${timeoutMs ?? 15000}ms: ${lastUrl}`);
      }
      throw lastError;
    }

    return finalResponse;
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
    timeoutMs?: number,
    monitor?: AiMonitorContext,
    options?: { suppressUsageLog?: boolean },
  ) {
    const response = await this.requestRaw(path, init, timeoutMs, monitor, options);

    if (!response.ok) {
      throw new Error(`Provider request failed (${response.status}): ${response.body}`);
    }

    return JSON.parse(response.body) as T;
  }

  private async requestChatCompletion<T>(
    body: Record<string, unknown>,
    timeoutMs?: number,
    monitor?: AiMonitorContext,
    options?: { suppressUsageLog?: boolean; signal?: AbortSignal },
  ) {
    try {
      return await this.requestJson<T>("/chat/completions", {
        method: "POST",
        body: JSON.stringify(body),
        signal: options?.signal,
      }, timeoutMs, monitor, options);
    } catch (error) {
      if (!("temperature" in body) || !isUnsupportedTemperatureError(error)) {
        throw error;
      }

      return this.requestJson<T>("/chat/completions", {
        method: "POST",
        body: JSON.stringify(omitTemperature(body)),
        signal: options?.signal,
      }, timeoutMs, monitor, options);
    }
  }
  private async requestMultipartJson<T>(
    path: string,
    fields: Record<string, string | number | boolean | null | undefined>,
    images: string[],
    options?: {
      imageFieldName?: "image" | "image[]";
      timeoutMs?: number;
      monitor?: AiMonitorContext;
      signal?: AbortSignal;
    },
  ) {
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined) {
        form.append(key, String(value));
      }
    }

    const imageFieldName = options?.imageFieldName ?? (images.length > 1 ? "image[]" : "image");
    images.forEach((image, index) => {
      form.append(imageFieldName, dataUrlToBlob(image), `image-${index + 1}.png`);
    });

    const response = await this.requestRaw(
      path,
      {
        method: "POST",
        body: form,
        signal: options?.signal,
      },
      options?.timeoutMs,
      options?.monitor,
    );

    if (!response.ok) {
      throw new Error(`Provider request failed (${response.status}): ${response.body}`);
    }

    return JSON.parse(response.body) as T;
  }

  private async requestGoogleJson<T>(
    path: string,
    body: unknown,
    timeoutMs = 45000,
    monitor?: AiMonitorContext,
    signal?: AbortSignal,
  ) {
    const base = deriveGoogleBaseUrl(this.baseUrl);
    const attempts = [
      `${base}/v1${path}`,
      `${base}/v1beta${path}`,
    ];
    const collapsedAttempts: Array<{
      endpoint: string;
      statusCode: number;
      success: boolean;
      errorMessage: string | null;
    }> = [];
    let finalSuccess: {
      body: string;
      url: string;
      status: number;
      durationMs: number;
    } | null = null;

    for (const url of attempts) {
      try {
        const response = await this.fetchRaw(
          url,
          {
            method: "POST",
            body: JSON.stringify(body),
            signal,
          },
          {
            "x-goog-api-key": this.apiKey,
          },
          timeoutMs,
          monitor,
          {
            suppressUsageLog: true,
          },
        );

        collapsedAttempts.push({
          endpoint: url,
          statusCode: response.status,
          success: response.ok,
          errorMessage: response.ok ? null : response.body.slice(0, 1000),
        });

        if (response.ok) {
          finalSuccess = {
            body: response.body,
            url,
            status: response.status,
            durationMs: response.durationMs,
          };
          break;
        }
      } catch (error) {
        collapsedAttempts.push({
          endpoint: url,
          statusCode: 0,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown Google protocol error",
        });
      }
    }

    const requestBody = JSON.stringify(body);
    const model = typeof (body as Record<string, unknown>)?.model === "string" ? String((body as Record<string, unknown>).model) : inferModelFromEndpoint(path);
    const retrySummary =
      collapsedAttempts.length > 1
        ? collapsedAttempts
            .filter((item) => !item.success)
            .map((item) => `${item.statusCode} ${item.endpoint}`)
            .join(" | ")
        : null;

    if (finalSuccess) {
      await logApiUsage({
        providerBaseUrl: normalizeBaseUrl(this.baseUrl),
        endpoint: finalSuccess.url,
        finalEndpoint: finalSuccess.url,
        method: "POST",
        model,
        ...readMonitorContext(monitor),
        category: inferCategory(finalSuccess.url, typeof body === "object" ? (body as Record<string, unknown>) : null),
        statusCode: finalSuccess.status,
        durationMs: collapsedAttempts.reduce((sum, item, index) => sum + (index === collapsedAttempts.length - 1 ? finalSuccess.durationMs : 0), 0) || finalSuccess.durationMs,
        success: true,
        requestBytes: Buffer.byteLength(requestBody),
        responseBytes: Buffer.byteLength(finalSuccess.body),
        responseBody: finalSuccess.body,
        attemptCount: collapsedAttempts.length,
        retrySummary,
        collapsedAttempts,
        errorMessage: null,
      });

      return JSON.parse(finalSuccess.body) as T;
    }

    const errorSummary = collapsedAttempts
      .map((item) => `${item.endpoint} -> ${item.statusCode}: ${item.errorMessage ?? "Unknown error"}`)
      .join(" | ");

    await logApiUsage({
      providerBaseUrl: normalizeBaseUrl(this.baseUrl),
      endpoint: attempts[attempts.length - 1] ?? `${base}/v1${path}`,
      finalEndpoint: attempts[attempts.length - 1] ?? `${base}/v1${path}`,
      method: "POST",
      model,
      ...readMonitorContext(monitor),
      category: inferCategory(`${base}/v1${path}`, typeof body === "object" ? (body as Record<string, unknown>) : null),
      statusCode: collapsedAttempts[collapsedAttempts.length - 1]?.statusCode ?? 0,
      durationMs: 0,
      success: false,
      requestBytes: Buffer.byteLength(requestBody),
      responseBytes: 0,
      responseBody: errorSummary,
      attemptCount: collapsedAttempts.length,
      retrySummary,
      collapsedAttempts,
      errorMessage: errorSummary,
    });

    throw new Error(`Google protocol request failed: ${errorSummary}`);
  }

  private async repairStructuredOutput<T>(input: StructuredRequest<T>, raw: string, reason: string) {
    const payload = await this.requestChatCompletion(
      withOptionalTemperature(
        input.model,
        {
          model: input.model,
          response_format: { type: "json_object" },
          messages: [
          {
            role: "system",
            content: "You repair malformed model output into strict valid JSON. Return JSON only.",
          },
          {
            role: "user",
            content: [
              `The previous response could not be parsed.`,
              `Reason: ${reason}`,
              "Convert the following content into strict valid JSON that matches the intended structure.",
              "Do not add markdown fences or commentary.",
              "",
              raw,
            ].join("\n"),
          },
          ],
        },
        0,
      ),
      Math.min(input.timeoutMs ?? 60000, 45000),
      input.monitor,
      { suppressUsageLog: input.suppressUsageLog, signal: input.signal },
    );

    const repairedRaw = extractTextContent(payload);
    return {
      parsed: tryParseStructuredPayload(repairedRaw, input.schema),
      raw: repairedRaw,
    };
  }

  private async probeGeminiImageSupport(model: string) {
    const tinyTransparentPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pW4xQAAAABJRU5ErkJggg==";

    const generationBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: "Generate a simple colored square." }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    };

    const editBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Edit this image slightly and keep the same subject." },
            { inlineData: dataUrlToInlineData(tinyTransparentPixel) },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    };

    const generationProbe = await this.fetchRaw(
      `${deriveGoogleBaseUrl(this.baseUrl)}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify(generationBody),
      },
      {
        "x-goog-api-key": this.apiKey,
      },
      5000,
      undefined,
      {
        suppressUsageLog: true,
      },
    );

    const editProbe = await this.fetchRaw(
      `${deriveGoogleBaseUrl(this.baseUrl)}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify(editBody),
      },
      {
        "x-goog-api-key": this.apiKey,
      },
      5000,
      undefined,
      {
        suppressUsageLog: true,
      },
    );

    return {
      imageGeneration: classifyProbeResult(generationProbe.status, generationProbe.body),
      imageEdit: classifyProbeResult(editProbe.status, editProbe.body),
      note: [generationProbe.body, editProbe.body].filter(Boolean).join(" | ").slice(0, 1000),
    };
  }

  private async probeOpenAiGptImageSupport(model: string) {
    const tinyTransparentPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pW4xQAAAABJRU5ErkJggg==";

    const generationProbe = await this.requestRaw(
      "/images/generations",
      {
        method: "POST",
        body: JSON.stringify({
          model,
          prompt: "probe",
          size: "1024x1024",
        }),
      },
      5000,
      undefined,
      {
        suppressUsageLog: true,
      },
    );

    let editProbe;
    try {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", "probe");
      form.append("size", "1024x1024");
      form.append("image", dataUrlToBlob(tinyTransparentPixel), "probe.png");

      editProbe = await this.requestRaw(
        "/images/edits",
        {
          method: "POST",
          body: form,
        },
        5000,
        undefined,
        {
          suppressUsageLog: true,
        },
      );
    } catch (error) {
      editProbe = {
        status: 0,
        body: error instanceof Error ? error.message : "Unknown multipart image edit probe error",
      };
    }

    return {
      imageGeneration: classifyProbeResult(generationProbe.status, generationProbe.body),
      imageEdit: classifyProbeResult(editProbe.status, editProbe.body),
      note: [generationProbe.body, editProbe.body].filter(Boolean).join(" | ").slice(0, 1000),
    };
  }

  async probeImageEndpointSupport(model: string) {
    return {
      imageGeneration: "unknown" as const,
      imageEdit: "unknown" as const,
      note: `已跳过 ${model} 的真实图像接口探测，避免在校验/发现阶段消耗图像额度。`,
    };
  }

  async testConnection() {
    await this.requestJson<{ data?: unknown[] }>("/models", { method: "GET" });
    return {
      ok: true,
      providerLabel: normalizeBaseUrl(this.baseUrl),
    };
  }

  async listModels() {
    const payload = await this.requestJson<{ data?: Array<Record<string, unknown> & { id: string; label?: string; name?: string }> }>("/models", {
      method: "GET",
    });
    return (payload.data ?? []).map((item) => ({
      id: item.id,
      label: item.label ?? item.name ?? item.id,
      type: typeof item.type === "string" ? item.type : typeof item.category === "string" ? item.category : null,
      category: typeof item.category === "string" ? item.category : typeof item.type === "string" ? item.type : null,
      modalities: Array.isArray(item.modalities)
        ? item.modalities.filter((entry): entry is string => typeof entry === "string")
        : Array.isArray(item.capabilities)
          ? item.capabilities.filter((entry): entry is string => typeof entry === "string")
          : undefined,
    }));
  }

  async generateText(input: TextRequest) {
    const payload = await this.requestChatCompletion(
      withOptionalTemperature(input.model, {
        model: input.model,
        messages: buildMessages(input),
      }, 0.4),
      input.timeoutMs ?? 60000,
      input.monitor,
      { suppressUsageLog: input.suppressUsageLog, signal: input.signal },
    );

    return {
      text: extractTextContent(payload),
    };
  }

  async generateStructured<T>(input: StructuredRequest<T>) {
    const payload = await this.requestChatCompletion(
      withOptionalTemperature(input.model, {
        model: input.model,
        messages: buildMessages(input),
        response_format: { type: "json_object" },
      }, 0.2),
      input.timeoutMs ?? 60000,
      input.monitor,
      { suppressUsageLog: input.suppressUsageLog, signal: input.signal },
    );

    const raw = extractTextContent(payload);

    try {
      const parsed = tryParseStructuredPayload(raw, input.schema);
      return { parsed, raw };
    } catch (error) {
      return this.repairStructuredOutput(
        input,
        raw,
        error instanceof Error ? error.message : "Unknown structured parse error",
      );
    }
  }

  private async generateGeminiImageWithGoogleProtocol(input: {
    model: string;
    prompt: string;
    referenceImages?: string[];
    baseImage?: string | null;
    size?: string;
    aspectRatio?: "1:1" | "3:4" | "9:16";
    monitor?: AiMonitorContext;
    signal?: AbortSignal;
  }) {
    const imageParts = [input.baseImage ?? null, ...(input.referenceImages ?? [])]
      .filter(Boolean)
      .map((item) => ({ inlineData: dataUrlToInlineData(item as string) }));

    const payload = await this.requestGoogleJson<any>(`/models/${input.model}:generateContent`, {
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: resolveAspectRatio(input),
        },
      },
    }, 90000, input.monitor, input.signal);

    return extractGoogleImageResult(payload);
  }

  private async generateOpenAiGptImageWithReferences(input: {
    model: string;
    prompt: string;
    images: string[];
    size?: string;
    aspectRatio?: "1:1" | "3:4" | "9:16";
    timeoutMs?: number;
    monitor?: AiMonitorContext;
    signal?: AbortSignal;
  }) {
    const fields = {
      model: input.model,
      prompt: input.prompt,
      size: resolveOpenAiSize(input),
    };
    const errors: string[] = [];

    for (const imageFieldName of ["image[]", "image"] as const) {
      try {
        const payload = await this.requestMultipartJson<{
          data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
        }>("/images/edits", fields, input.images, {
          imageFieldName,
          timeoutMs: input.timeoutMs ?? 120000,
          monitor: input.monitor,
          signal: input.signal,
        });

        return extractImageResult(payload);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown GPT Image multipart error");
      }
    }

    throw new Error(`GPT Image multipart request failed: ${errors.join(" | ")}`);
  }

  async generateImage(input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const referenceImages = input.referenceImages ?? [];
    let googleProtocolError: unknown = null;

    if (isGeminiImageModel(input.model)) {
      try {
        return await this.generateGeminiImageWithGoogleProtocol({
          model: input.model,
          prompt: input.prompt,
          referenceImages,
          size: input.size,
          aspectRatio: input.aspectRatio,
          monitor: input.monitor,
          signal: input.signal,
        });
      } catch (error) {
        googleProtocolError = error;
        if (!referenceImages.length) {
          throw error;
        }
      }
    }

    if (referenceImages.length > 0) {
      const referenceErrors: string[] = [];
      if (googleProtocolError instanceof Error) {
        referenceErrors.push(`Google protocol failed: ${googleProtocolError.message}`);
      }

      if (isOpenAiGptImageModel(input.model)) {
        try {
          return await this.generateOpenAiGptImageWithReferences({
            model: input.model,
            prompt: input.prompt,
            images: referenceImages,
            size: input.size,
            aspectRatio: input.aspectRatio,
            timeoutMs: input.timeoutMs,
            monitor: input.monitor,
            signal: input.signal,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown GPT Image reference generation error";
          throw new Error(`GPT Image reference generation via /images/edits failed: ${message}`);
        }
      }

      const imageRefs = toImageRefs(referenceImages);

      for (const attempt of [
        {
          path: "/images/edits",
          body: {
            model: input.model,
            prompt: input.prompt,
            size: resolveOpenAiSize(input),
            images: imageRefs,
          },
        },
        {
          path: "/images/edits",
          body: {
            model: input.model,
            prompt: input.prompt,
            size: resolveOpenAiSize(input),
            images: imageRefs,
            input_fidelity: "high",
          },
        },
        {
          path: "/images/generations",
          body: {
            model: input.model,
            prompt: input.prompt,
            size: resolveOpenAiSize(input),
            reference_images: imageRefs,
          },
        },
        {
          path: "/images/generations",
          body: {
            model: input.model,
            prompt: input.prompt,
            size: resolveOpenAiSize(input),
            input_images: imageRefs,
          },
        },
      ]) {
        try {
          const payload = await this.requestJson<{
            data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
          }>(attempt.path, {
            method: "POST",
            body: JSON.stringify(attempt.body),
            signal: input.signal,
          }, input.timeoutMs ?? 120000, input.monitor);

          return extractImageResult(payload);
        } catch (error) {
          referenceErrors.push(error instanceof Error ? error.message : "Unknown reference image generation error");
        }
      }

      throw new Error(`Reference-guided image generation failed: ${referenceErrors.join(" | ")}`);
    }

    try {
      const payload = await this.requestJson<{
        data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
      }>("/images/generations", {
        method: "POST",
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          size: resolveOpenAiSize(input),
        }),
        signal: input.signal,
      }, input.timeoutMs ?? 120000, input.monitor);

      return extractImageResult(payload);
    } catch (error) {
      if (!isGeminiImageModel(input.model)) {
        throw error;
      }

      return this.generateGeminiImageWithGoogleProtocol({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        aspectRatio: input.aspectRatio,
        monitor: input.monitor,
        signal: input.signal,
      });
    }
  }

  async editImage(input: ImageEditRequest): Promise<ImageGenerationResult> {
    const imageRefs = toImageRefs([input.image, ...(input.referenceImages ?? [])]);
    let googleProtocolError: unknown = null;
    if (isGeminiImageModel(input.model)) {
      try {
        return await this.generateGeminiImageWithGoogleProtocol({
          model: input.model,
          prompt: input.prompt,
          baseImage: input.image,
          referenceImages: input.referenceImages,
          size: input.size,
          aspectRatio: input.aspectRatio,
          monitor: input.monitor,
          signal: input.signal,
        });
      } catch (error) {
        googleProtocolError = error;
        // Fall through to compatibility attempts for providers that proxy Gemini image models via OpenAI image APIs.
      }
    }

    if (isOpenAiGptImageModel(input.model)) {
      try {
        return await this.generateOpenAiGptImageWithReferences({
          model: input.model,
          prompt: input.prompt,
          images: [input.image, ...(input.referenceImages ?? [])],
          size: input.size,
          aspectRatio: input.aspectRatio,
          timeoutMs: input.timeoutMs,
          monitor: input.monitor,
          signal: input.signal,
        });
      } catch {
        // Fall through to JSON compatibility attempts for third-party gateways.
      }
    }

    const attempts = [
      {
        path: "/images/edits",
        body: {
          model: input.model,
          prompt: input.prompt,
          size: resolveOpenAiSize(input),
          images: imageRefs,
          ...(input.mask ? { mask: toMaskRef(input.mask) } : {}),
        },
      },
      {
        path: "/images/edits",
        body: {
          model: input.model,
          prompt: input.prompt,
          size: resolveOpenAiSize(input),
          images: imageRefs,
          input_fidelity: "high",
          ...(input.mask ? { mask: toMaskRef(input.mask) } : {}),
        },
      },
      {
        path: "/images/generations",
        body: {
          model: input.model,
          prompt: input.prompt,
          size: resolveOpenAiSize(input),
          reference_images: imageRefs,
          ...(input.mask ? { mask: toMaskRef(input.mask) } : {}),
        },
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        const payload = await this.requestJson<{
          data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
        }>(attempt.path, {
          method: "POST",
          body: JSON.stringify(attempt.body),
          signal: input.signal,
        }, input.timeoutMs ?? 120000, input.monitor);

        return extractImageResult(payload);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown image edit error");
      }
    }

    if (isGeminiImageModel(input.model)) {
      errors.unshift(
        googleProtocolError instanceof Error
          ? `Google protocol image edit failed: ${googleProtocolError.message}`
          : "Google protocol image edit attempt did not complete successfully",
      );
    }

    throw new Error(`Base64 image edit failed: ${errors.join(" | ")}`);
  }
}

export function parseProviderError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.flatten();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown provider error";
}
