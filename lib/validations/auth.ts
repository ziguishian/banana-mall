import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱"),
  password: z.string().min(6, "密码至少 6 位").max(64, "密码最多 64 位"),
  name: z.string().trim().max(40, "昵称最多 40 字").optional(),
  emailCode: z.string().trim().regex(/^\d{6}$/, "请输入 6 位邮箱验证码"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱"),
  password: z.string().min(1, "请输入密码"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
