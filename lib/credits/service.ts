import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { HttpError } from "@/lib/utils/http-error";

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function normalizePoints(value: number) {
  return Math.round(Math.max(0, value) * 10000) / 10000;
}

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return toNumber(user?.credits);
}

export async function chargeCredits(
  userId: string,
  amount: number,
  reason: string,
  projectId?: string,
  taskType?: string,
): Promise<{ balanceAfter: number; chargedAmount: number }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true, creditMultiplier: true },
    });
    if (!user) {
      throw new HttpError(401, "UNAUTHORIZED", "用户不存在。");
    }

    const currentCredits = toNumber(user.credits);
    const chargedAmount = normalizePoints(amount * (user.creditMultiplier || 1));
    if (chargedAmount <= 0) {
      throw new HttpError(400, "INVALID_CREDIT_AMOUNT", "扣除积分必须大于 0。");
    }
    if (currentCredits < chargedAmount) {
      throw new HttpError(
        402,
        "INSUFFICIENT_CREDITS",
        `生成积分不足，当前剩余 ${currentCredits} 积分，本次需要 ${chargedAmount} 积分。请充值或配置自己的 API Key。`,
      );
    }

    const balanceAfter = normalizePoints(currentCredits - chargedAmount);
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } });
    await tx.creditTransaction.create({
      data: { userId, delta: -chargedAmount, balanceAfter, reason, projectId, taskType },
    });
    return { balanceAfter, chargedAmount };
  });
}

export async function chargeFixedCredits(
  userId: string,
  amount: number,
  reason: string,
  projectId?: string,
  taskType?: string,
): Promise<{ balanceAfter: number; chargedAmount: number }> {
  const chargedAmount = normalizePoints(amount);
  if (chargedAmount <= 0) {
    throw new HttpError(400, "INVALID_CREDIT_AMOUNT", "扣除积分必须大于 0。");
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user) {
      throw new HttpError(401, "UNAUTHORIZED", "用户不存在。");
    }
    const currentCredits = toNumber(user.credits);
    if (currentCredits < chargedAmount) {
      throw new HttpError(402, "INSUFFICIENT_CREDITS", `积分不足，当前剩余 ${currentCredits} 积分，违规扣费需要 ${chargedAmount} 积分。`);
    }
    const balanceAfter = normalizePoints(currentCredits - chargedAmount);
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } });
    await tx.creditTransaction.create({
      data: { userId, delta: -chargedAmount, balanceAfter, reason, projectId, taskType },
    });
    return { balanceAfter, chargedAmount };
  });
}

export async function refundCredits(
  userId: string,
  amount: number,
  reason: string,
  projectId?: string,
  taskType?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user) return 0;
    const balanceAfter = normalizePoints(toNumber(user.credits) + amount);
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } });
    await tx.creditTransaction.create({
      data: { userId, delta: amount, balanceAfter, reason, projectId, taskType },
    });
    return balanceAfter;
  });
}
