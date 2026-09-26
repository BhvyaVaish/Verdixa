export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { LoginSchema, loginUser, UserServiceError } from "@/domain/users/userService";
import { buildSessionCookie } from "@/lib/auth/session";

// POST /api/v1/auth/login
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { signedToken, userId, role } = await loginUser(parsed.data);

    const cookie = buildSessionCookie(signedToken);
    const res = NextResponse.json({ userId, role }, { status: 200 });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (err) {
    if (err instanceof UserServiceError && err.code === "INVALID_CREDENTIALS") {
      // Generic message — never distinguish "no such user" from "wrong password"
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    console.error("[login] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
