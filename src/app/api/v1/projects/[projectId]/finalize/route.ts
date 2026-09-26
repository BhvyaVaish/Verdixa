import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { finalizeProject, SubmissionServiceError } from "@/domain/submissions/submissionService";
import { AuthorizationError } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const { projectId } = await params;

    const finalized = await finalizeProject(projectId, session);
    
    return NextResponse.json({
      id: finalized.id,
      status: finalized.status,
      submittedAt: finalized.submittedAt,
      lockedAt: finalized.lockedAt,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof SubmissionServiceError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        EVENT_NOT_FOUND: 404,
        FORBIDDEN: 403,
        ALREADY_SUBMITTED: 422,
        DEADLINE_PASSED: 422,
      };
      return NextResponse.json({ error: error.message }, { status: statusMap[error.code] || 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
