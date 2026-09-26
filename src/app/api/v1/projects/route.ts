import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { createProject, listMyProjects, CreateProjectSchema, SubmissionServiceError } from "@/domain/submissions/submissionService";
import { AuthorizationError } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const body = await request.json();
    const data = CreateProjectSchema.parse(body);

    const project = await createProject(data, session);
    
    // Allow-list DTO for created project
    return NextResponse.json({
      id: project.id,
      title: project.title,
      status: project.status,
      teamId: project.teamId,
      eventId: project.eventId,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof SubmissionServiceError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        EVENT_NOT_FOUND: 404,
        FORBIDDEN: 403,
        DEADLINE_PASSED: 422,
        DUPLICATE_SUBMISSION: 409,
      };
      return NextResponse.json({ error: error.message }, { status: statusMap[error.code] || 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const projects = await listMyProjects(session);
    
    // Allow-list mapping
    const dto = projects.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      team: { id: p.team.id, name: p.team.name },
      event: { id: p.event.id, name: p.event.name, submissionDeadline: p.event.submissionDeadline },
      track: p.track ? { id: p.track.id, name: p.track.name } : null,
      mediaAssetCount: p._count.mediaAssets,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json(dto);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
