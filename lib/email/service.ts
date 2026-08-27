import nodemailer from "nodemailer";

import { getConfig, getConfigsByCategory } from "@/lib/site-config/service";

export type EmailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
};

export async function getEmailConfig(): Promise<EmailConfig> {
  const cfg = await getConfigsByCategory("email");
  const port = Number(cfg.smtp_port) || 465;
  return {
    enabled: cfg.email_enabled === "true",
    host: cfg.smtp_host ?? "",
    port,
    user: cfg.smtp_user ?? "",
    pass: cfg.smtp_pass ?? "",
    from: cfg.smtp_from ?? cfg.smtp_user ?? "",
    secure: cfg.smtp_secure === "true" || port === 465,
  };
}

export async function isEmailEnabled(): Promise<boolean> {
  return (await getConfig("email_enabled")) === "true";
}

async function createTransport() {
  const cfg = await getEmailConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    throw new Error("SMTP 未配置完整（host/user/pass 必填）");
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const cfg = await getEmailConfig();
  if (!cfg.enabled) return;
  const transport = await createTransport();
  await transport.sendMail({
    from: cfg.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

export async function sendWelcomeMail(to: string, name?: string | null): Promise<void> {
  const siteName = (await getConfig("site_name")) || "MxPage";
  const greeting = name ? `你好，${name}！` : "你好！";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">${greeting}</h2>
      <p style="color: #475569; line-height: 1.7;">
        欢迎注册 <strong>${siteName}</strong>。你的账号已创建成功，系统已赠送 <strong>20 次生成额度</strong>，
        可用于 AI 商品详情页生成、小红书图文创作等功能。
      </p>
      <p style="color: #475569; line-height: 1.7;">
        如果这不是你本人的操作，请忽略本邮件。
      </p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e2e8f0;" />
      <p style="color: #94a3b8; font-size: 12px;">本邮件由系统自动发送，请勿回复。</p>
    </div>
  `;
  await sendMail({
    to,
    subject: `欢迎注册 ${siteName}`,
    html,
  });
}

export async function sendRegisterVerificationMail(to: string, code: string): Promise<void> {
  const siteName = (await getConfig("site_name")) || "MxPage";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 22px;">注册邮箱验证</h2>
      <p style="margin: 0 0 18px; color: #475569; line-height: 1.7;">你正在注册 <strong>${siteName}</strong>，请输入下面的验证码完成注册。</p>
      <div style="margin: 24px 0; padding: 18px 20px; border-radius: 14px; background: #f1f5f9; text-align: center; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #0284c7;">${code}</div>
      <p style="margin: 0; color: #64748b; line-height: 1.7;">验证码 10 分钟内有效。若不是你本人操作，请忽略这封邮件。</p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e2e8f0;" />
      <p style="color: #94a3b8; font-size: 12px;">本邮件由系统自动发送，请勿直接回复。</p>
    </div>
  `;
  await sendMail({
    to,
    subject: `${siteName} 注册验证码：${code}`,
    html,
    text: `你的 ${siteName} 注册验证码是 ${code}，10 分钟内有效。`,
  });
}

export async function testEmailConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await getEmailConfig();
    if (!cfg.host || !cfg.user || !cfg.pass) {
      return { ok: false, message: "SMTP 配置不完整（host/user/pass 必填）" };
    }
    const transport = await createTransport();
    await transport.verify();
    return { ok: true, message: "SMTP 连接成功" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "SMTP 连接失败",
    };
  }
}
