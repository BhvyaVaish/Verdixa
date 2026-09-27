import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { runNormalization, getLatestNormalizationRun } from "@/domain/judging/normalizationService";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/organizer/normalization?eventId=xxx
 * Returns the latest normalization run for an event, or 404 if none.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const run = await getLatestNormalizationRun(eventId);
  if (!run) return NextResponse.json({ run: null });

  return NextResponse.json({ run });
}

/**
 * POST /api/v1/organizer/normalization
 * Triggers a new normalization run for an event (organizer only).
 * Body: { eventId: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { eventId } = body;
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  try {
    const result = await runNormalization(eventId, session.userId);

    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "NORMALIZATION_RUN",
        entityType: "NormalizationRun",
        entityId: result.runId,
        payload: {
          eventId,
          flagCount: result.result.flags.length,
          projectCount: result.rankings.length,
          normalized: result.result.normalized,
        },
      },
    });

    return NextResponse.json({
      runId: result.runId,
      rankings: result.rankings,
      judgeProgress: result.judgeProgress,
      flags: result.result.flags,
      normalized: result.result.normalized,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
