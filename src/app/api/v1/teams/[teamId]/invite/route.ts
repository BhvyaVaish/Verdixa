export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { AuthorizationError, authErrorResponse } from "@/lib/auth/requireRole";
import { generateInviteToken, acceptInvite, TeamServiceError } from "@/domain/teams/teamService";

// POST /api/v1/teams/[teamId]/invite — generate invite token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const session = await getSession(extractSessionCookie(req.headers.get("cookie")));

  try {
    const { token, expiresAt } = await generateInviteToken(teamId, session);
    return NextResponse.json({ token, expiresAt }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthorizationError) return authErrorResponse(err);
    if (err instanceof TeamServiceError && err.code === "NOT_FOUND") {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[invite:POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
