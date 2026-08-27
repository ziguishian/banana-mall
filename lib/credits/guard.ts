import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { chargeCredits, refundCredits } from "@/lib/credits/service";
import { prisma } from "@/lib/db/prisma";
import { runWithProviderCredentials } from "@/lib/services/provider-runtime";
import { decryptSecret } from "@/lib/utils/crypto";
import { HttpError } from "@/lib/utils/http-error";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function getUserActiveCredentials(
  userId: string,
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const config = await prisma.userProviderConfig.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!config) return null;
  try {
    return { apiKey: decryptSecret(config.apiKeyEncrypted), baseUrl: config.baseUrl };
  } catch {
    return null;
  }
}

async function getPlatformActiveCredentials(): Promise<{ apiKey: string; baseUrl: string }> {
  const config = await prisma.providerConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { apiKeyEncrypted: true, baseUrl: true },
  });
  if (!config) {
    throw new HttpError(
      500,
      "PROVIDER_NOT_CONFIGURED",
      "平台尚未配置 AI 服务。请在「个人 API Key」页配置自己的 Key，或联系管理员。",
    );
  }
  return { apiKey: decryptSecret(config.apiKeyEncrypted), baseUrl: config.baseUrl };
}

function shouldRefundBaseCharge(error: unknown) {
  return !(error instanceof HttpError && error.code === "SENSITIVE_WORD_BLOCKED");
}

/**
 * 同步 AI 调用的统一包裹：
 * - 用户已配置自己的 API Key → 注入其凭据，不消耗平台积分
 * - 否则使用平台 Key，按用户倍率扣除积分，调用失败自动退还
 */
export async function withCreditGuard<T>(
  request: NextRequest,
  options: { taskType: string; projectId?: string },
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const user = await requireUser(request);
    const ownCreds = await getUserActiveCredentials(user.id);

    let result: T;
    if (ownCreds) {
      result = await runWithProviderCredentials(
        { apiKey: ownCreds.apiKey, baseUrl: ownCreds.baseUrl },
        handler,
      );
    } else {
      const platformCreds = await getPlatformActiveCredentials();
      const charge = await chargeCredits(user.id, 1, options.taskType, options.projectId, options.taskType);
      try {
        result = await runWithProviderCredentials(
          { apiKey: platformCreds.apiKey, baseUrl: platformCreds.baseUrl },
          handler,
        );
      } catch (error) {
        if (shouldRefundBaseCharge(error)) {
          await refundCredits(user.id, charge.chargedAmount, `${options.taskType}_REFUND`, options.projectId, options.taskType);
        }
        throw error;
      }
    }
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

type ActiveCredentials = { apiKey?: string; baseUrl?: string };
type AsyncTaskContext = { userId: string; chargedCredits: number; taskType: string; projectId?: string };

/**
 * 异步任务型 AI 调用的统一包裹（如整页翻译、批量创建、小红书）。
 * handler 接收 (credentials, ctx)：
 *   - credentials：当前生效的 API 凭据，传给后台任务
 *   - ctx.userId / ctx.chargedCredits：用于后台任务失败时退费
 * 任务后台失败时，由 workflow-task-service 调用 refundTaskCredits 退还。
 */
export async function withCreditGuardAsync<T>(
  request: NextRequest,
  options: { taskType: string; projectId?: string; status?: number },
  handler: (credentials: ActiveCredentials, ctx: AsyncTaskContext) => Promise<T>,
): Promise<NextResponse> {
  try {
    const user = await requireUser(request);
    const ownCreds = await getUserActiveCredentials(user.id);
    const init = options.status ? { status: options.status } : undefined;
    const ctx: AsyncTaskContext = {
      userId: user.id,
      chargedCredits: 0,
      taskType: options.taskType,
      projectId: options.projectId,
    };

    if (ownCreds) {
      const result = await handler({ apiKey: ownCreds.apiKey, baseUrl: ownCreds.baseUrl }, ctx);
      return ok(result, init);
    }

    const platformCreds = await getPlatformActiveCredentials();
    const charge = await chargeCredits(user.id, 1, options.taskType, options.projectId, options.taskType);
    ctx.chargedCredits = charge.chargedAmount;
    try {
      const result = await handler({ apiKey: platformCreds.apiKey, baseUrl: platformCreds.baseUrl }, ctx);
      return ok(result, init);
    } catch (error) {
      if (shouldRefundBaseCharge(error)) {
        await refundCredits(user.id, charge.chargedAmount, `${options.taskType}_REFUND`, options.projectId, options.taskType);
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
