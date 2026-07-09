import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/utils/api";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(apiSuccess(data), init);
}

export function fail(code: string, message: string, details?: unknown, status = 400) {
  return NextResponse.json(apiError(code, message, details), { status });
}

function mapProviderError(error: Error) {
  const text = error.message.toLowerCase();

  if (/monthly spending limit|spending limit|insufficient_quota|quota|billing|额度已用尽|月度限额/.test(text)) {
    return {
      code: "SPENDING_LIMIT_REACHED",
      message: "当前 API Key 的额度已用尽。请前往代理商控制台提高或移除月度限额，或更换可用的 API Key。",
      status: 403,
    };
  }

  if (/rate limit|429|限流/.test(text)) {
    return {
      code: "RATE_LIMITED",
      message: "当前请求触发了限流。请稍后重试，或降低调用频率。",
      status: 429,
    };
  }

  if (/invalid token|unauthorized|forbidden|鉴权失败|401|403/.test(text)) {
    return {
      code: "PROVIDER_AUTH_ERROR",
      message: "当前 Provider 鉴权失败。请检查 baseURL、API Key 或代理商权限配置。",
      status: 401,
    };
  }

  if (/timed out|aborterror|network error|fetch failed|provider request failed \(504\)|gateway time-out|请求超时|网络异常/.test(text)) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "当前 Provider 请求超时或网络异常，请稍后重试。",
      status: 504,
    };
  }

  return null;
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "请求参数校验失败", error.flatten(), 400);
  }

  if (error instanceof Error) {
    const providerError = mapProviderError(error);
    if (providerError) {
      return fail(providerError.code, providerError.message, { rawMessage: error.message }, providerError.status);
    }

    const message = error.message.toLowerCase();
    if (message.includes("not found")) {
      return fail("NOT_FOUND", error.message, null, 404);
    }

    return fail("INTERNAL_ERROR", error.message, null, 500);
  }

  return fail("UNKNOWN_ERROR", "未知错误", null, 500);
}
