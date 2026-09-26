import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { z } from "zod";

export const dynamic = "force-dynamic";

const submitScoresSchema = z.object({
  scores: z.record(z.string(), z.number()) // criterionId -> score
});

export async function POST(request: NextRequest, { params }: { params: { assignmentId: string } }) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    if (!session || session.role !== "judge") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = submitScoresSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const assignment = await db.judgeAssignment.findUnique({
      where: { id: params.assignmentId }
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (assignment.judgeId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Must have a scorecard to update
    const scorecard = await db.scoreCard.findUnique({
      where: { assignmentId: assignment.id },
      include: { rubric: { include: { criteria: true } } }
    });

    if (!scorecard) {
      return NextResponse.json({ error: "Scorecard not initialized" }, { status: 400 });
    }

    // Validate scores against criteria
    for (const [critId, score] of Object.entries(parsed.data.scores)) {
      const crit = scorecard.rubric.criteria.find(c => c.id === critId);
      if (!crit) {
        return NextResponse.json({ error: `Invalid criterion ${critId}` }, { status: 400 });
      }
      if (score < 1 || score > crit.maxScore) {
        return NextResponse.json({ error: `Score ${score} out of bounds for ${crit.name}` }, { status: 400 });
      }
    }

    // Verify all criteria are scored to mark as submitted
    const isComplete = scorecard.rubric.criteria.every(c => parsed.data.scores[c.id] !== undefined);

    await db.$transaction(async (tx) => {
      // Upsert scores
      for (const [critId, score] of Object.entries(parsed.data.scores)) {
        await tx.criterionScore.upsert({
          where: { scorecardId_criterionId: { scorecardId: scorecard.id, criterionId: critId } },
          update: { score },
          create: { scorecardId: scorecard.id, criterionId: critId, score }
        });
      }

      // Update scorecard submission time if complete
      if (isComplete) {
        await tx.scoreCard.update({
          where: { id: scorecard.id },
          data: { submittedAt: new Date() }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SCORES_SUBMITTED",
          entityType: "ScoreCard",
          entityId: scorecard.id,
          payload: { isComplete, criteriaCount: Object.keys(parsed.data.scores).length }
        }
      });
    });

    return NextResponse.json({ success: true, isComplete });
  } catch (error) {
    console.error("POST /api/v1/scores/[assignmentId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
