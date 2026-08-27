import { chargeFixedCredits } from "@/lib/credits/service";
import { getConfig } from "@/lib/site-config/service";
import { HttpError } from "@/lib/utils/http-error";

export type SensitiveFilterSettings = {
  enabled: boolean;
  promptCheckEnabled: boolean;
  violationChargeEnabled: boolean;
  violationChargeAmount: number;
  words: string[];
};

function parseBoolean(value: string | null, fallback = false) {
  if (value === null) return fallback;
  return ["true", "1", "yes", "on", "enabled"].includes(value.trim().toLowerCase());
}

function parseWords(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAmount(value: string | null, fallback: number) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

export async function getSensitiveFilterSettings(): Promise<SensitiveFilterSettings> {
  const [enabled, promptEnabled, violationChargeEnabled, violationChargeAmount, words] = await Promise.all([
    getConfig("sensitive_filter_enabled"),
    getConfig("sensitive_prompt_check_enabled"),
    getConfig("sensitive_violation_charge_enabled"),
    getConfig("sensitive_violation_charge_amount"),
    getConfig("sensitive_words"),
  ]);

  return {
    enabled: parseBoolean(enabled, false),
    promptCheckEnabled: parseBoolean(promptEnabled, true),
    violationChargeEnabled: parseBoolean(violationChargeEnabled, false),
    violationChargeAmount: parseAmount(violationChargeAmount, 0.05),
    words: parseWords(words),
  };
}

export function findSensitiveWord(text: string, words: string[]) {
  const normalized = text.toLowerCase();
  return words.find((word) => normalized.includes(word.toLowerCase())) ?? null;
}

export async function assertPromptAllowed(text: string, userId?: string) {
  const settings = await getSensitiveFilterSettings();
  if (!settings.enabled || !settings.promptCheckEnabled || settings.words.length === 0) return;
  const matched = findSensitiveWord(text, settings.words);
  if (!matched) return;

  let chargedAmount = 0;
  if (settings.violationChargeEnabled && userId) {
    const charge = await chargeFixedCredits(
      userId,
      settings.violationChargeAmount,
      "SENSITIVE_WORD_PENALTY",
      undefined,
      "SAFETY",
    );
    chargedAmount = charge.chargedAmount;
  }

  throw new HttpError(
    400,
    "SENSITIVE_WORD_BLOCKED",
    chargedAmount > 0
      ? `您的内容因含有敏感词汇，已被系统自动拦截，已按违规规则扣除 ${chargedAmount} 积分。`
      : "您的内容因含有敏感词汇，已被系统自动拦截。",
    { chargedAmount, violationChargeEnabled: settings.violationChargeEnabled },
  );
}
