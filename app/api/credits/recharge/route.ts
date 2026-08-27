import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createRechargeOrder, isPayjsConfigured } from "@/lib/payments/payjs";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

const rechargeSchema = z.object({
  amountCents: z.coerce.number().int().min(100, "最低充值 1 元").max(1000000, "单笔不超过 1 万元"),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await isPayjsConfigured())) {
      return fail("PAYJS_NOT_CONFIGURED", "支付未配置。请联系管理员开通。", null, 503);
    }
    const user = await requireUser(request);
    const input = rechargeSchema.parse(await request.json());
    const order = await createRechargeOrder(user.id, input.amountCents);
    return ok(order, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
