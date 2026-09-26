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

    const assignments = await db.judgeAssignment.findMany({
      where: { judgeId: session.userId },
      include: {
        project: {
          select: { id: true, title: true, teamId: true }
        },
        scorecard: {
          select: { id: true, submittedAt: true }
        }
      },
      orderBy: { assignedAt: "desc" }
    });

    const dto = assignments.map(a => ({
      id: a.id,
      projectId: a.projectId,
      projectTitle: a.project.title,
      assignedAt: a.assignedAt,
      isSubmitted: !!a.scorecard?.submittedAt,
      scorecardId: a.scorecard?.id || null
    }));

    return NextResponse.json({ assignments: dto });
  } catch (error) {
    console.error("GET /api/v1/judges/me/assignments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
