import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { validateAndSaveUpload } from "@/domain/submissions/uploadService";
import { SubmissionServiceError } from "@/domain/submissions/submissionService";
import { AuthorizationError } from "@/lib/auth/requireRole";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
    const { projectId } = await params;
    
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const asset = await validateAndSaveUpload(file, projectId, session);
    
    return NextResponse.json({
      id: asset.id,
      url: `/api/v1/uploads/${asset.id}`,
      filename: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof SubmissionServiceError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        ALREADY_SUBMITTED: 422,
        DEADLINE_PASSED: 422,
      };
      return NextResponse.json({ error: error.message }, { status: statusMap[error.code] || 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 400 });
  }
}
