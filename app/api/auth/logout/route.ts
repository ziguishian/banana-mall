import { clearSessionCookie } from "@/lib/auth/session";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST() {
  try {
    const response = ok({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
