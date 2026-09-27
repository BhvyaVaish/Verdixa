import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/organizer/dashboard?eventId=xxx
 * Returns judge progress, project coverage, and outstanding assignments.
 * Organizer/admin only.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  // Judge progress: assigned vs completed per judge
  const assignments = await db.judgeAssignment.findMany({
    where: { eventId },
    include: {
      judge: { select: { id: true, email: true } },
      scorecard: { select: { id: true, submittedAt: true } },
      project: { select: { id: true, title: true } },
    },
  });

  // Group by judge
  const byJudge = new Map<string, { email: string; assigned: number; completed: number; outstanding: { projectId: string; projectTitle: string }[] }>();
  for (const a of assignments) {
    if (!byJudge.has(a.judgeId)) {
      byJudge.set(a.judgeId, { email: a.judge.email, assigned: 0, completed: 0, outstanding: [] });
    }
    const entry = byJudge.get(a.judgeId)!;
    entry.assigned++;
    if (a.scorecard?.submittedAt) {
      entry.completed++;
    } else {
      entry.outstanding.push({ projectId: a.projectId, projectTitle: a.project.title });
    }
  }

  // Group by project: how many judges have reviewed it vs total assigned
  const byProject = new Map<string, { title: string; assigned: number; reviewed: number }>();
  for (const a of assignments) {
    if (!byProject.has(a.projectId)) {
      byProject.set(a.projectId, { title: a.project.title, assigned: 0, reviewed: 0 });
    }
    const entry = byProject.get(a.projectId)!;
    entry.assigned++;
    if (a.scorecard?.submittedAt) entry.reviewed++;
  }

  const judgeProgress = [...byJudge.entries()].map(([judgeId, d]) => ({
    judgeId,
    email: d.email,
    assigned: d.assigned,
    completed: d.completed,
    outstanding: d.assigned - d.completed,
    completionPct: d.assigned > 0 ? Math.round((d.completed / d.assigned) * 100) : 0,
    outstandingProjects: d.outstanding,
  }));

  const projectCoverage = [...byProject.entries()].map(([projectId, d]) => ({
    projectId,
    title: d.title,
    assigned: d.assigned,
    reviewed: d.reviewed,
    coveragePct: d.assigned > 0 ? Math.round((d.reviewed / d.assigned) * 100) : 0,
    isMissingReviews: d.reviewed < d.assigned,
  }));

  // Summary stats
  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter((a) => a.scorecard?.submittedAt).length;

  return NextResponse.json({
    summary: {
      totalJudges: byJudge.size,
      totalProjects: byProject.size,
      totalAssignments,
      completedAssignments,
      outstandingAssignments: totalAssignments - completedAssignments,
      overallCompletionPct: totalAssignments > 0
        ? Math.round((completedAssignments / totalAssignments) * 100)
        : 0,
    },
    judgeProgress: judgeProgress.sort((a, b) => a.completionPct - b.completionPct),
    projectCoverage: projectCoverage.sort((a, b) => a.coveragePct - b.coveragePct),
  });
}
