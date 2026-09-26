import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    if (!session || session.role !== "judge") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scorecards = await db.scoreCard.findMany({
      where: { judgeId: session.userId },
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
    console.error("GET /api/v1/scores/me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
