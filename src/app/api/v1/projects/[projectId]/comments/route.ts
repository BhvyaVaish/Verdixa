import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { addComment, getProjectComments, getAllProjectComments } from "@/domain/voting/commentService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  const isOrganizer = session?.role === "organizer" || session?.role === "admin";

  const comments = isOrganizer
    ? await getAllProjectComments(projectId)
    : await getProjectComments(projectId);

  return NextResponse.json({ comments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.body) return NextResponse.json({ error: "body required" }, { status: 400 });

  const result = await addComment(projectId, session.userId, body.body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, commentId: result.commentId }, { status: 201 });
}
