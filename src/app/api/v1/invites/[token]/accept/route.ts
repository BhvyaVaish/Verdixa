export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { AuthorizationError, authErrorResponse } from "@/lib/auth/requireRole";
import { acceptInvite, TeamServiceError } from "@/domain/teams/teamService";

// POST /api/v1/invites/[token]/accept
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await getSession(extractSessionCookie(req.headers.get("cookie")));

  try {
    const { teamId } = await acceptInvite(token, session);
    return NextResponse.json({ teamId }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthorizationError) return authErrorResponse(err);
    if (err instanceof TeamServiceError) {
      const statusMap: Record<string, number> = {
        INVITE_INVALID: 404,
        INVITE_USED: 409,
        INVITE_EXPIRED: 410,
        ALREADY_MEMBER: 409,
      };
      const status = statusMap[err.code] ?? 422;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[accept-invite] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
