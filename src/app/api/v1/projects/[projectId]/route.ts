import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { getProject, updateProject, UpdateProjectSchema, SubmissionServiceError } from "@/domain/submissions/submissionService";
import { AuthorizationError } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const { projectId } = await params;
    
    const { project, accessLevel } = await getProject(projectId, session);
    
    // Member DTO (full access)
    if (accessLevel === "member") {
      return NextResponse.json({
        id: project.id,
        title: project.title,
        description: project.description,
        repoUrl: project.repoUrl,
        demoUrl: project.demoUrl,
        videoUrl: project.videoUrl,
        status: project.status,
        teamId: project.teamId,
        eventId: project.eventId,
        trackId: project.trackId,
        submittedAt: project.submittedAt,
        lockedAt: project.lockedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        mediaAssets: project.mediaAssets,
        team: project.team,
        track: project.track,
      });
    }

    // Public DTO (safe subset)
    return NextResponse.json({
      id: project.id,
      title: project.title,
      description: project.description,
      repoUrl: project.repoUrl,
      demoUrl: project.demoUrl,
      videoUrl: project.videoUrl,
      status: project.status,
      teamId: project.teamId,
      eventId: project.eventId,
      submittedAt: project.submittedAt,
      mediaAssets: project.mediaAssets.map(ma => ({ id: ma.id, url: `/api/v1/uploads/${ma.id}` })),
      team: project.team,
      track: project.track,
    });

  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof SubmissionServiceError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
      };
      return NextResponse.json({ error: error.message }, { status: statusMap[error.code] || 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const { projectId } = await params;
    const body = await request.json();
    const data = UpdateProjectSchema.parse(body);

    const updated = await updateProject(projectId, data, session);
    
    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      status: updated.status,
      updatedAt: updated.updatedAt,
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
