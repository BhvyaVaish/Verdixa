import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("q") || "";
    const trackId = searchParams.get("track") || undefined;
    const eventId = searchParams.get("event") || undefined;
    
    // In a real app we'd paginate, for this prototype limit to 100
    const limit = 100;

    const whereClause: any = {
      status: "submitted", // ONLY submitted projects in the public gallery
    };
    
    if (eventId) whereClause.eventId = eventId;
    if (trackId) whereClause.trackId = trackId;
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { team: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const projects = await db.project.findMany({
      where: whereClause,
      include: {
        team: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        track: { select: { id: true, name: true } },
        mediaAssets: { select: { id: true, mimeType: true } }, // only what's needed for URLs
      },
      orderBy: { submittedAt: "desc" },
      take: limit,
    });

    // Explicit allow-list DTO for public gallery
    const dto = projects.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl,
      videoUrl: p.videoUrl,
      teamName: p.team.name,
      teamId: p.team.id,
      eventName: p.event.name,
      eventId: p.event.id,
      trackName: p.track?.name || null,
      trackId: p.track?.id || null,
      submittedAt: p.submittedAt,
      mediaAssets: p.mediaAssets.map(ma => ({ id: ma.id, url: `/api/v1/uploads/${ma.id}` })),
    }));

    return NextResponse.json(dto);
  } catch (error) {
    console.error("Gallery API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
