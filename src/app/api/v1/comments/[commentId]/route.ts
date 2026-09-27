import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { hideComment, restoreComment } from "@/domain/voting/commentService";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await params;
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action; // "hide" or "restore"

  if (action === "hide") {
    if (!body.reason) return NextResponse.json({ error: "reason required" }, { status: 400 });
    const result = await hideComment(commentId, session.userId, body.reason);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  } else if (action === "restore") {
    const result = await restoreComment(commentId, session.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
