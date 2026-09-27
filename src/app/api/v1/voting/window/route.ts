import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/voting/window
 * Organizer creates a new voting window.
 * Body: { eventId, opensAt, closesAt, resultsHidden? }
 *
 * GET /api/v1/voting/window?eventId=xxx
 * List all voting windows for an event.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { eventId, opensAt, closesAt, resultsHidden = true } = body;
  if (!eventId || !opensAt || !closesAt) {
    return NextResponse.json({ error: "eventId, opensAt, closesAt required" }, { status: 400 });
  }

  const opens = new Date(opensAt);
  const closes = new Date(closesAt);
  if (opens >= closes) {
    return NextResponse.json({ error: "opensAt must be before closesAt" }, { status: 400 });
  }

  const window = await db.votingWindow.create({
    data: {
      eventId,
      opensAt: opens,
      closesAt: closes,
      resultsHidden,
      createdBy: session.userId,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: session.userId,
      action: "VOTING_WINDOW_CREATED",
      entityType: "VotingWindow",
      entityId: window.id,
      payload: { eventId, opensAt, closesAt, resultsHidden },
    },
  });

  return NextResponse.json({ window }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  // Non-organizers can see windows but not full results
  const isOrganizer = session && (session.role === "organizer" || session.role === "admin");

  const windows = await db.votingWindow.findMany({
    where: { eventId },
    orderBy: { opensAt: "desc" },
    include: { _count: { select: { votes: { where: { retractedAt: null } } } } },
  });

  const now = new Date();
  return NextResponse.json({
    windows: windows.map((w) => ({
      id: w.id,
      eventId: w.eventId,
      opensAt: w.opensAt,
      closesAt: w.closesAt,
      resultsHidden: w.resultsHidden,
      isOpen: w.opensAt <= now && w.closesAt >= now,
      // Only show total count to organizers during active window
      totalVotes: isOrganizer || w.closesAt < now ? w._count.votes : null,
    })),
  });
}
