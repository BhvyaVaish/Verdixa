export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RegisterSchema, LoginSchema, registerUser, loginUser, UserServiceError } from "@/domain/users/userService";
import { buildSessionCookie, extractSessionCookie, destroySession } from "@/lib/auth/session";

// POST /api/v1/auth/register
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId } = await registerUser(parsed.data);
    return NextResponse.json({ userId }, { status: 201 });
  } catch (err) {
    if (err instanceof UserServiceError && err.code === "EMAIL_TAKEN") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[register] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
