import crypto from "crypto";
import QRCode from "qrcode";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/utils/env";
import { getConfig, getConfigWithDefault } from "@/lib/site-config/service";
import { HttpError } from "@/lib/utils/http-error";

const DEFAULT_MZFPAY_API_URL = "https://pay.mzfpay.com/xpay/epay/mapi.php";
const DEFAULT_MZFPAY_GATEWAY_URL = "https://pay.mzfpay.com/xpay/epay/submit.php";
const MZFPAY_TYPES = new Set(["alipay", "wxpay", "qqpay"]);

function md5Lower(value: string): string {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

async function getPayjsKey(): Promise<string> {
  const dbValue = await getConfig("payjs_key");
  if (dbValue && dbValue.trim()) return dbValue;
  return env.PAYJS_KEY ?? "";
}

function normalizeMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function getMzfpayType(): Promise<string> {
  const type = await getConfigWithDefault("payjs_type", "PAYJS_TYPE", "alipay");
  return MZFPAY_TYPES.has(type) ? type : "alipay";
}

async function buildSign(params: Record<string, string | number | undefined | null>): Promise<string> {
  const sorted = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const key = await getPayjsKey();
  return md5Lower(`${sorted}${key}`);
}

function buildSignedQuery(params: Record<string, string | number>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  return search.toString();
}

async function getSiteBaseUrl(): Promise<string> {
  const dbSiteUrl = await getConfig("site_url");
  return (dbSiteUrl || env.APP_BASE_URL || "").replace(/\/+$/, "");
}

function normalizeEpayApiUrl(value: string) {
  const raw = (value || DEFAULT_MZFPAY_API_URL).trim();
  const url = new URL(raw);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/mapi.php";
  } else if (url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}mapi.php`;
  }
  return url.toString();
}

function deriveEpaySubmitUrl(apiUrl: string) {
  const url = new URL(apiUrl);
  if (/\/mapi\.php$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/mapi\.php$/i, "submit.php");
    return url.toString();
  }
  if (/\/submit\.php$/i.test(url.pathname)) return url.toString();
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/submit.php";
  } else if (url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}submit.php`;
  }
  return url.toString();
}

function isOrderMonitorUrl(value: string) {
  return /\/checkOrder\//i.test(value);
}

function buildNotifyUrl(input: { explicitNotify?: string; configuredNotify: string; siteBaseUrl: string }) {
  const candidate = (input.explicitNotify ?? input.configuredNotify ?? "").trim();
  if (candidate && !isOrderMonitorUrl(candidate)) return candidate;
  if (input.siteBaseUrl) return `${input.siteBaseUrl}/api/credits/payjs-notify`;
  throw new HttpError(
    400,
    "PAYJS_NOTIFY_URL_INVALID",
    "支付回调地址配置错误：请填写你自己网站的公网 HTTPS 地址，路径为 /api/credits/payjs-notify，不要填写支付平台的 checkOrder 订单监控地址。项目本地 localhost 无法接收支付平台回调。",
  );
}

export function generateOutTradeNo(userId: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const userPart = userId.slice(0, 8).padEnd(8, "0");
  return `MX${stamp}${random}${userPart}`.toUpperCase();
}

export async function isPayjsConfigured(): Promise<boolean> {
  const pid = await getConfigWithDefault("payjs_mchid", "PAYJS_MCHID");
  const key = await getPayjsKey();
  return Boolean(pid && key);
}

export type PayjsNativeResponse = {
  code?: number | string;
  msg?: string;
  return_code?: number;
  return_msg?: string;
  out_trade_no?: string;
  trade_no?: string;
  payjs_order_id?: string;
  payurl?: string;
  pay_url?: string;
  url?: string;
  code_url?: string;
  qrcode?: string;
};

export async function createPayjsNativeOrder(params: {
  outTradeNo: string;
  totalFee: number;
  notifyUrl?: string;
  body?: string;
  attach?: string;
}): Promise<PayjsNativeResponse> {
  if (!(await isPayjsConfigured())) {
    throw new HttpError(500, "PAYJS_NOT_CONFIGURED", "MZFPay 未配置。请在管理后台「系统配置」中设置商户 ID 和密钥。");
  }

  const pid = await getConfigWithDefault("payjs_mchid", "PAYJS_MCHID");
  const apiUrl = normalizeEpayApiUrl(await getConfigWithDefault("payjs_api_url", "PAYJS_API_URL", DEFAULT_MZFPAY_API_URL));
  const submitUrl = deriveEpaySubmitUrl(apiUrl);
  const defaultNotify = await getConfigWithDefault("payjs_notify_url", "PAYJS_NOTIFY_URL", "");
  const payType = await getMzfpayType();
  const siteBaseUrl = await getSiteBaseUrl();
  const notifyUrl = buildNotifyUrl({ explicitNotify: params.notifyUrl, configuredNotify: defaultNotify, siteBaseUrl });

  const payload: Record<string, string | number> = {
    pid,
    type: payType,
    out_trade_no: params.outTradeNo,
    notify_url: notifyUrl,
    return_url: siteBaseUrl ? `${siteBaseUrl}/settings/credits` : notifyUrl,
    name: params.body ?? "MxPage 额度充值",
    money: normalizeMoney(params.totalFee),
    clientip: "127.0.0.1",
    device: "pc",
  };
  if (params.attach) payload.param = params.attach;

  payload.sign = await buildSign(payload);
  payload.sign_type = "MD5";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: buildSignedQuery(payload),
  });
  if (!res.ok) {
    throw new HttpError(502, "PAYJS_REQUEST_FAILED", `MZFPay 接口请求失败: HTTP ${res.status}`);
  }

  const text = await res.text();
  let data: PayjsNativeResponse;
  try {
    data = JSON.parse(text) as PayjsNativeResponse;
  } catch {
    return {
      code: 1,
      msg: "MZFPay 返回支付页面",
      out_trade_no: params.outTradeNo,
      payurl: text.startsWith("http") ? text : `${submitUrl}?${buildSignedQuery(payload)}`,
    };
  }

  return data;
}

export async function verifyPayjsNotify(params: Record<string, string>): Promise<boolean> {
  const sign = params.sign;
  if (!sign) return false;
  const expected = await buildSign(params);
  return expected.toLowerCase() === sign.toLowerCase();
}

function isMzfpaySuccess(response: PayjsNativeResponse) {
  if (response.return_code !== undefined) return response.return_code === 1;
  if (response.code !== undefined) return String(response.code) === "1";
  return Boolean(response.payurl || response.pay_url || response.url || response.qrcode || response.code_url);
}

function getMzfpayMessage(response: PayjsNativeResponse) {
  return response.return_msg || response.msg || "MZFPay 下单失败";
}

async function createQrDataUrl(content: string | null | undefined): Promise<string | null> {
  if (!content) return null;
  return QRCode.toDataURL(content, { margin: 1, width: 256 });
}

export async function createRechargeOrder(
  userId: string,
  amountCents: number,
): Promise<{ orderId: string; outTradeNo: string; qrcodeUrl: string | null; payUrl: string | null; credits: number }> {
  if (amountCents < 100) {
    throw new HttpError(400, "INVALID_AMOUNT", "最低充值 1 元。");
  }
  const creditsPerYuanStr = await getConfigWithDefault("credits_per_yuan", "CREDITS_PER_YUAN", "5");
  const creditsPerYuan = Number(creditsPerYuanStr) || env.CREDITS_PER_YUAN;
  const credits = Math.floor(amountCents / 100) * creditsPerYuan;
  const outTradeNo = generateOutTradeNo(userId);

  const payjs = await createPayjsNativeOrder({
    outTradeNo,
    totalFee: amountCents,
    body: `MxPage 充值 ${credits} 次`,
    attach: userId,
  });

  if (!isMzfpaySuccess(payjs)) {
    throw new HttpError(502, "PAYJS_ORDER_FAILED", getMzfpayMessage(payjs));
  }

  const payUrl = payjs.payurl ?? payjs.pay_url ?? payjs.url ?? payjs.code_url ?? null;
  const qrcodeUrl = payjs.qrcode ?? (await createQrDataUrl(payUrl));

  const order = await prisma.order.create({
    data: {
      userId,
      amountCents,
      credits,
      outTradeNo,
      payjsOrderId: payjs.trade_no ?? payjs.payjs_order_id ?? null,
      qrcodeUrl,
      payUrl,
      status: "PENDING",
    },
  });

  return {
    orderId: order.id,
    outTradeNo,
    qrcodeUrl: order.qrcodeUrl,
    payUrl: order.payUrl,
    credits,
  };
}

export async function handlePayjsNotify(params: Record<string, string>): Promise<{ ok: boolean }> {
  const verified = await verifyPayjsNotify(params);
  if (!verified) {
    return { ok: false };
  }

  const outTradeNo = params.out_trade_no;
  const payjsOrderId = params.trade_no || params.payjs_order_id;
  const tradeStatus = params.trade_status || params.status;
  if (!outTradeNo) return { ok: false };
  if (tradeStatus && !["TRADE_SUCCESS", "SUCCESS", "PAID"].includes(tradeStatus.toUpperCase())) return { ok: false };

  const order = await prisma.order.findUnique({ where: { outTradeNo } });
  if (!order) return { ok: false };
  if (order.status === "PAID") return { ok: true };

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: order.userId }, select: { credits: true } });
    if (!user) throw new Error("User not found");
    const balanceAfter = Number(user.credits) + Number(order.credits);
    await tx.user.update({ where: { id: order.userId }, data: { credits: balanceAfter } });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", payjsOrderId: payjsOrderId ?? order.payjsOrderId, paidAt: new Date() },
    });
    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        delta: order.credits,
        balanceAfter,
        reason: "RECHARGE",
        orderId: order.id,
      },
    });
  });

  return { ok: true };
}

export async function testPayjsConnection(): Promise<{ ok: boolean; message: string; qrcodeUrl?: string }> {
  try {
    if (!(await isPayjsConfigured())) {
      return { ok: false, message: "MZFPay 配置不完整（商户 ID / 密钥必填）" };
    }
    const outTradeNo = `TEST${Date.now().toString(36)}`.toUpperCase();
    const result = await createPayjsNativeOrder({
      outTradeNo,
      totalFee: 100,
      body: "MxPage 配置测试",
    });
    if (isMzfpaySuccess(result)) {
      return {
        ok: true,
        message: "MZFPay 下单成功，配置有效",
        qrcodeUrl: result.qrcode,
      };
    }
    return { ok: false, message: getMzfpayMessage(result) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "MZFPay 测试失败",
    };
  }
}
