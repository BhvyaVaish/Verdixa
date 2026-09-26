export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { extractSessionCookie, destroySession, buildSessionCookie } from "@/lib/auth/session";

// POST /api/v1/auth/logout
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const signedToken = extractSessionCookie(cookieHeader);

  if (signedToken) {
    await destroySession(signedToken);
  }

  const clearCookie = buildSessionCookie("", { clear: true });
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", clearCookie);
  return res;
}
