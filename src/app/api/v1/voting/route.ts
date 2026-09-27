import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { getBallot, castVote, retractVote, getVoteTallies, getActiveWindow } from "@/domain/voting/votingService";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/voting?eventId=xxx
 * Returns the voting ballot (randomised project order per voter).
 * Vote counts hidden from non-organizers while window is open.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const ballot = await getBallot(eventId, session?.userId ?? null);
  return NextResponse.json(ballot);
}

/**
 * POST /api/v1/voting
 * Cast a vote. Requires authentication.
 * Body: { votingWindowId, projectId }
 */
export async function POST(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { votingWindowId, projectId } = body;
  if (!votingWindowId || !projectId) {
    return NextResponse.json({ error: "votingWindowId and projectId required" }, { status: 400 });
  }

  // Get caller IP (Next.js header set by proxy, or loopback)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "127.0.0.1";

  const result = await castVote(votingWindowId, session.userId, projectId, ip);
  if (!result.ok) {
    const statusMap: Record<string, number> = {
      rate_limit_exceeded: 429,
      voting_window_closed: 403,
      already_voted: 409,
      window_not_found: 404,
    };
    return NextResponse.json(
      { error: result.error },
      { status: statusMap[result.error ?? ""] ?? 400 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * DELETE /api/v1/voting
 * Retract a vote. Body: { votingWindowId, projectId }
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { votingWindowId, projectId } = body;
  if (!votingWindowId || !projectId) {
    return NextResponse.json({ error: "votingWindowId and projectId required" }, { status: 400 });
  }

  const result = await retractVote(votingWindowId, session.userId, projectId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "voting_window_closed" ? 403 : 400 });
  }

  return NextResponse.json({ ok: true });
}
