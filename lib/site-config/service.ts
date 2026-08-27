import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";

/**
 * SiteConfig 是管理员可后台修改的 key-value 配置表。
 * 敏感字段（smtp_pass / payjs_key）以加密形式存储。
 *
 * 已知 key（约定）：
 *   general:
 *     - site_name
 *     - site_url
 *   email:
 *     - email_enabled      ("true" | "false")
 *     - smtp_host
 *     - smtp_port
 *     - smtp_user
 *     - smtp_pass          (加密)
 *     - smtp_from
 *     - smtp_secure        ("true" | "false")
 *   payjs:
 *     - payjs_mchid
 *     - payjs_key          (加密)
 *     - payjs_notify_url
 *     - payjs_api_url
 *     - credits_per_yuan
 */

const SENSITIVE_KEYS = new Set(["smtp_pass", "payjs_key"]);

export async function getConfig(key: string): Promise<string | null> {
  const row = await prisma.siteConfig.findUnique({ where: { key } });
  if (!row) return null;
  if (SENSITIVE_KEYS.has(key)) {
    try {
      return decryptSecret(row.value);
    } catch {
      return null;
    }
  }
  return row.value;
}

export async function getConfigsByCategory(category: string): Promise<Record<string, string>> {
  const rows = await prisma.siteConfig.findMany({ where: { category } });
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (SENSITIVE_KEYS.has(row.key)) {
      try {
        result[row.key] = decryptSecret(row.value);
      } catch {
        result[row.key] = "";
      }
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

export async function getAllConfigs(): Promise<Record<string, string>> {
  const rows = await prisma.siteConfig.findMany();
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (SENSITIVE_KEYS.has(row.key)) {
      try {
        result[row.key] = decryptSecret(row.value);
      } catch {
        result[row.key] = "";
      }
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

function categoryOf(key: string): string {
  if (key.startsWith("smtp_") || key.startsWith("email_")) return "email";
  if (key.startsWith("payjs_") || key === "credits_per_yuan") return "payjs";
  if (key.startsWith("sensitive_")) return "safety";
  return "general";
}

export async function setConfig(key: string, value: string): Promise<void> {
  const category = categoryOf(key);
  const stored = SENSITIVE_KEYS.has(key) ? encryptSecret(value) : value;
  await prisma.siteConfig.upsert({
    where: { key },
    create: { key, value: stored, category },
    update: { value: stored },
  });
}

export async function setConfigs(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    // 空字符串敏感字段视为不更新（保留原值），避免误清空
    if (SENSITIVE_KEYS.has(key) && value === "") continue;
    await setConfig(key, value);
  }
}

/**
 * 带默认值的读取：先查 DB，DB 没有就回退到 process.env
 */
export async function getConfigWithDefault(key: string, envKey: string, fallback = ""): Promise<string> {
  const dbValue = await getConfig(key);
  if (dbValue && dbValue.trim()) return dbValue;
  return process.env[envKey] ?? fallback;
}
