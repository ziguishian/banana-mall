import { NextRequest, NextResponse } from "next/server";

import { handlePayjsNotify } from "@/lib/payments/payjs";

/**
 * Payjs 异步回调。Body 为 form-urlencoded，字段都是字符串。
 * 回调成功必须返回 "success"（小写无引号），否则 Payjs 会重试。
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/json")) {
      const json = await request.json();
      for (const [key, value] of Object.entries(json ?? {})) {
        params[key] = String(value);
      }
    } else {
      const text = await request.text();
      const search = new URLSearchParams(text);
      for (const [key, value] of search.entries()) {
        params[key] = value;
      }
    }

    const result = await handlePayjsNotify(params);
    // Payjs 要求成功返回纯文本 success
    return new NextResponse(result.ok ? "success" : "fail", {
      status: result.ok ? 200 : 400,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[payjs-notify] error:", error);
    return new NextResponse("fail", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
