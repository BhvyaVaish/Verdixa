export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { AuthorizationError, authErrorResponse } from "@/lib/auth/requireRole";
import { CreateTeamSchema, createTeam, TeamServiceError } from "@/domain/teams/teamService";

// POST /api/v1/teams — participant only
export async function POST(req: NextRequest) {
  const session = await getSession(extractSessionCookie(req.headers.get("cookie")));

  try {
    const body = await req.json();
    const parsed = CreateTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { teamId } = await createTeam(parsed.data, session);
    return NextResponse.json({ teamId }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthorizationError) return authErrorResponse(err);
    if (err instanceof TeamServiceError) {
      const status =
        err.code === "EVENT_NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[teams:POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
