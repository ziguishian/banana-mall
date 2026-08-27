import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
};

const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured (needs >= 16 chars).");
  }
  return encoder.encode(secret);
}

function getTtlDays(): number {
  const raw = Number(process.env.AUTH_TOKEN_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${getTtlDays()}d`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: typeof payload.role === "string" ? payload.role : "user",
    };
  } catch {
    return null;
  }
}
