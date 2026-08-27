import { getCurrentUser } from "@/lib/auth/session";
import { fail, handleRouteError, ok } from "@/lib/utils/route";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return fail("UNAUTHORIZED", "未登录", null, 401);
    }
    return ok(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
