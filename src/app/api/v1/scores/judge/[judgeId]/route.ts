import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { judgeId: string } }) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role Isolation: Only the judge themselves OR organizer/admin can view a judge's scores
    const isOwner = session.userId === params.judgeId;
    const isOrganizer = session.role === "organizer" || session.role === "admin";
    
    if (!isOwner && !isOrganizer) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const scorecards = await db.scoreCard.findMany({
      where: { judgeId: params.judgeId },
      include: {
        project: {
          select: { id: true, title: true, teamId: true }
        },
        scores: {
          select: { criterionId: true, score: true, criterion: { select: { name: true, weight: true } } }
        }
      }
    });

    return NextResponse.json({ scorecards });
  } catch (error) {
    console.error("GET /api/v1/scores/judge/[judgeId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
