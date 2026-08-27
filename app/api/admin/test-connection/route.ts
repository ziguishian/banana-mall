import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { testEmailConnection } from "@/lib/email/service";
import { testPayjsConnection } from "@/lib/payments/payjs";
import { handleRouteError, ok } from "@/lib/utils/route";

/**
 * 测试连接：body.type = "email" | "payjs"
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { type } = (await request.json().catch(() => ({}))) as { type?: string };

    if (type === "email") {
      const result = await testEmailConnection();
      return ok(result);
    }
    if (type === "payjs") {
      const result = await testPayjsConnection();
      return ok(result);
    }
    return ok({ ok: false, message: "未知测试类型，支持 email / payjs" });
  } catch (error) {
    return handleRouteError(error);
  }
}
