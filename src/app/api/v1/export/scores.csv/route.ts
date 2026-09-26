import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    if (!session || (session.role !== "organizer" && session.role !== "admin")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const criteriaScores = await db.criterionScore.findMany({
      include: {
        criterion: true,
        scorecard: {
          include: {
            project: true,
          }
        }
      }
    });

    const headers = "project_id,project_title,team_id,judge_id,criterion,score,weighted_score\n";
    const rows = criteriaScores.map(cs => {
      const p = cs.scorecard.project;
      const weightedScore = (cs.score * cs.criterion.weight).toFixed(2);
      
      // Escape title for CSV
      let title = p.title || "";
      if (title.includes(',') || title.includes('"')) {
        title = `"${title.replace(/"/g, '""')}"`;
      }
      
      return `${p.id},${title},${p.teamId},${cs.scorecard.judgeId},${cs.criterion.name},${cs.score},${weightedScore}`;
    }).join("\n");

    return new NextResponse(headers + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="scores.csv"'
      }
    });
  } catch (error) {
    console.error("GET /api/v1/export/scores.csv error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
