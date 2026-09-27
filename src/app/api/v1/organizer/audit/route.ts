import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse filters
  const action = request.nextUrl.searchParams.get("action");
  const entityType = request.nextUrl.searchParams.get("entityType");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

  const where: any = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { email: true, role: true } },
    },
  });

  return NextResponse.json({ logs });
}
