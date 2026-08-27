"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { CloudTunnel } from "@/components/auth/cloud-tunnel";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/store";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

type IconComponent = ComponentType<{ className?: string }>;

export function AuthForm({ mode, redirect }: { mode: Mode; redirect?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [authMood, setAuthMood] = useState<"idle" | "cover" | "error" | "success">("idle");
  const [friendlyMessage, setFriendlyMessage] = useState("我会帮你守住密码，放心输入吧。");
  const t = useTranslation();

  const isRegister = mode === "register";
  const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const codeValid = /^\d{6}$/.test(emailCode.trim());
  const guardianMood = authMood === "error" ? "error" : passwordFocused ? "cover" : authMood;

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  async function sendEmailCode() {
    if (!emailValid) {
      toast.error("请输入有效邮箱后再发送验证码");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const retryAfter = Number(data.error?.details?.retryAfter ?? 0);
        if (retryAfter > 0) setCodeCooldown(retryAfter);
        toast.error(data.error?.message ?? "验证码发送失败，请稍后重试");
        return;
      }
      setCodeCooldown(Number(data.data?.cooldown ?? 60));
      toast.success("验证码已发送，请查收邮箱");
    } catch {
      toast.error("网络异常，验证码发送失败");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthMood("idle");
    setFriendlyMessage("我在认真核对，稍等一下。");
    if (isRegister && !codeValid) {
      setAuthMood("error");
      setFriendlyMessage("验证码还差一点点，填满 6 位再继续哦。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { email: normalizedEmail, password, name: name || undefined, emailCode: emailCode.trim() }
            : { email: normalizedEmail, password },
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthMood("error");
        setFriendlyMessage(data.error?.code === "INVALID_CREDENTIALS" ? "再试一次哦，账号或密码可能没有对上。" : data.error?.message ?? "再试一次哦，我刚刚没能确认成功。");
        return;
      }
      setAuthMood("success");
      setFriendlyMessage(isRegister ? "欢迎加入，准备起飞啦。" : "欢迎回来，正在带你进入工作台。");
      toast.success(isRegister ? "注册成功" : "登录成功");
      const target = redirect && redirect.startsWith("/") ? redirect : "/";
      window.location.href = target;
    } catch {
      setAuthMood("error");
      setFriendlyMessage("网络像云层一样晃了一下，稍后再试一次哦。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-sky relative min-h-screen overflow-hidden bg-[#2da8e8] text-slate-950">
      <div className="absolute right-4 top-4 z-30">
        <LocaleSwitcher />
      </div>

      <CloudTunnel />
      <div className="auth-cloud-bank absolute inset-x-0 bottom-[-14vh] h-[24vh]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.08),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0),rgba(45,168,232,0.018)_58%,rgba(255,255,255,0.025))]" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <section className="grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_390px]">
          <div className="hidden md:block">
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.38em] text-slate-800/80">MxPage</p>
              <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-normal text-slate-950 drop-shadow-[0_12px_28px_rgba(255,255,255,0.72)]">
                AI 商品图文工作台
              </h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-slate-800 drop-shadow-[0_10px_24px_rgba(255,255,255,0.72)]">
                穿梭在云层之间，继续你的商品分析、图文生成、批量创建、充值额度和模型配置。每个账号拥有独立会话与权限。
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-xs text-slate-800">
                <span className="rounded-full border border-slate-900/12 bg-white/36 px-3 py-1.5 backdrop-blur">商品分析</span>
                <span className="rounded-full border border-slate-900/12 bg-white/36 px-3 py-1.5 backdrop-blur">详情页生成</span>
                <span className="rounded-full border border-slate-900/12 bg-white/36 px-3 py-1.5 backdrop-blur">独立账号体系</span>
              </div>
            </div>
          </div>

          <div className="auth-login-card relative mx-auto w-full max-w-[390px] rounded-[26px] border border-slate-900/12 bg-white/58 p-7 text-slate-950 shadow-[0_28px_70px_-30px_rgba(15,23,42,0.42)] backdrop-blur-2xl">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-900/18 to-transparent" />
            <div className="mb-7 text-center">
              <LoginGuardian mood={guardianMood} message={friendlyMessage} />
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">
                {isRegister ? t("auth.registerTitle") : t("auth.loginTitle")}
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                {isRegister ? t("auth.registerDesc") : t("auth.loginDesc")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister ? (
                <AuthField icon={UserRound} label={t("auth.name")} htmlFor="name">
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("auth.namePlaceholder")}
                    className="auth-input pl-11"
                  />
                </AuthField>
              ) : null}

              <AuthField icon={Mail} label={t("auth.email")} htmlFor="email" valid={emailValid}>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="auth-input pl-11"
                />
              </AuthField>

              {isRegister ? (
                <AuthField icon={ShieldCheck} label="邮箱验证码" htmlFor="emailCode">
                  <div className="flex gap-2">
                    <Input
                      id="emailCode"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={emailCode}
                      onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="请输入 6 位验证码"
                      className="auth-input min-w-0 pl-11 pr-4"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!emailValid || sendingCode || codeCooldown > 0}
                      onClick={sendEmailCode}
                      className="h-[46px] shrink-0 rounded-full border-slate-900/12 bg-white/70 px-4 text-slate-950 hover:bg-white hover:text-slate-950"
                    >
                      {sendingCode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}
                    </Button>
                  </div>
                </AuthField>
              ) : null}

              <AuthField icon={Lock} label={t("auth.password")} htmlFor="password" valid={password.length >= 6}>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => {
                    setPasswordFocused(true);
                    setFriendlyMessage("我把眼睛遮起来，你安心输入。");
                  }}
                  onBlur={() => {
                    setPasswordFocused(false);
                    if (authMood !== "error") setFriendlyMessage("我会帮你守住密码，放心输入吧。");
                  }}
                  placeholder={isRegister ? t("auth.passwordPlaceholderRegister") : t("auth.passwordPlaceholderLogin")}
                  className="auth-input pl-11"
                />
              </AuthField>


              <Button type="submit" disabled={loading || (isRegister && !codeValid)} className="mt-2 h-12 w-full rounded-full border border-sky-300/55 bg-[linear-gradient(135deg,#5fd8ff_0%,#1f9bff_44%,#0866f2_100%)] text-white shadow-[0_18px_42px_-22px_rgba(8,102,242,0.8)] hover:border-sky-100 hover:brightness-110 hover:text-white">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? t("auth.processing") : isRegister ? t("auth.registerBtn") : t("auth.loginBtn")}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-700">
              {isRegister ? (
                <>
                  {t("auth.toLogin")} {" "}
                  <Link href="/login" className="font-semibold text-slate-950 hover:underline">
                    {t("auth.loginLink")}
                  </Link>
                </>
              ) : (
                <>
                  {t("auth.toRegister")} {" "}
                  <Link href="/register" className="font-semibold text-slate-950 hover:underline">
                    {t("auth.registerLink")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginGuardian({ mood, message }: { mood: "idle" | "cover" | "error" | "success"; message: string }) {
  return (
    <div className={cn("auth-guardian mx-auto", `auth-guardian-${mood}`)} aria-live="polite">
      <div className={cn("auth-guardian-bubble", mood === "error" ? "auth-guardian-bubble-error" : mood === "success" ? "auth-guardian-bubble-success" : "auth-guardian-bubble-idle")}>{message}</div>
      <div className="auth-guardian-shadow" />
      <div className="auth-guardian-avatar" aria-hidden="true">
        <img src="/auth-cartoon-avatar.png" alt="" className="auth-guardian-avatar-image" draggable={false} />
      </div>
    </div>
  );
}

function AuthField({
  children,
  htmlFor,
  icon: Icon,
  label,
  valid,
}: {
  children: ReactNode;
  htmlFor: string;
  icon: IconComponent;
  label: string;
  valid?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-slate-800">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
        {children}
        <CheckCircle2 className={cn("pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200 transition-opacity", valid ? "opacity-100" : "opacity-0")} />
      </div>
    </div>
  );
}
