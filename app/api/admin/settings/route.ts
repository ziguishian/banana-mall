import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { getAllConfigs, setConfigs } from "@/lib/site-config/service";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const configs = await getAllConfigs();
    return ok(configs);
  } catch (error) {
    return handleRouteError(error);
  }
}

const updateSchema = z.object({
  // general
  site_name: z.string().trim().max(100).optional(),
  site_url: z.string().trim().url().or(z.literal("")).optional(),
  // email
  email_enabled: z.enum(["true", "false"]).optional(),
  smtp_host: z.string().trim().max(200).optional(),
  smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
  smtp_user: z.string().trim().max(200).optional(),
  smtp_pass: z.string().max(500).optional(), // 空字符串视为不更新（在 setConfigs 内处理）
  smtp_from: z.string().trim().max(200).optional(),
  smtp_secure: z.enum(["true", "false"]).optional(),
  // payjs
  payjs_mchid: z.string().trim().max(100).optional(),
  payjs_key: z.string().max(200).optional(), // 空字符串视为不更新
  payjs_type: z.enum(["alipay", "wxpay", "qqpay"]).optional(),
  payjs_notify_url: z.string().trim().url().or(z.literal("")).optional(),
  payjs_api_url: z.string().trim().url().or(z.literal("")).optional(),
  credits_per_yuan: z.coerce.number().int().positive().max(1000).optional(),
  // safety
  sensitive_filter_enabled: z.enum(["true", "false"]).optional(),
  sensitive_prompt_check_enabled: z.enum(["true", "false"]).optional(),
  sensitive_violation_charge_enabled: z.enum(["true", "false"]).optional(),
  sensitive_violation_charge_amount: z.coerce.number().positive().max(1000).optional(),
  sensitive_words: z.string().max(20000).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const input = updateSchema.parse(await request.json());

    // 过滤 undefined
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      values[key] = String(value);
    }

    if (Object.keys(values).length === 0) {
      return fail("VALIDATION_ERROR", "没有需要更新的字段", null, 400);
    }

    await setConfigs(values);
    const updated = await getAllConfigs();
    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
