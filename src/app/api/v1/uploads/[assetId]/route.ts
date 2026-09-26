import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;

    const asset = await db.mediaAsset.findUnique({
      where: { id: assetId },
      include: { project: { select: { status: true, teamId: true } } },
    });

    if (!asset) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Access control: if project is submitted, anyone can see the asset (public gallery).
    // If project is draft, only team members can see it.
    if (asset.project.status !== "submitted") {
      const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      
      const membership = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId: asset.project.teamId, userId: session.userId } },
      });
      
      if (!membership) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const filePath = path.join(UPLOADS_DIR, asset.storagePath);
    const fileBuffer = await fs.readFile(filePath);

    // Serve with correct MIME and inline disposition to prevent execution
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${asset.id}${path.extname(asset.filename)}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving upload:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
