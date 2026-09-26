export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession, extractSessionCookie } from "@/lib/auth/session";
import { requireRole, AuthorizationError, authErrorResponse } from "@/lib/auth/requireRole";
import { CreateEventSchema, createEvent, listEvents, EventServiceError } from "@/domain/events/eventService";

// GET /api/v1/events — public
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as Parameters<typeof listEvents>[0] ?? undefined;
    const events = await listEvents(status);

    // Allow-list DTO: only expose fields appropriate for unauthenticated callers
    const dto = events.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      tracks: e.tracks.map((t) => ({ id: t.id, name: t.name })),
    }));

    return NextResponse.json({ events: dto });
  } catch (err) {
    console.error("[events:GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// POST /api/v1/events — organizer/admin only
export async function POST(req: NextRequest) {
  const session = await getSession(extractSessionCookie(req.headers.get("cookie")));

  try {
    // requireRole is called inside createEvent — but we also check here
    // to return the error before parsing the body (fast path for unauthenticated)
    requireRole(session, ["organizer", "admin"]);

    const body = await req.json();
    const parsed = CreateEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { eventId } = await createEvent(parsed.data, session);
    return NextResponse.json({ eventId }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthorizationError) return authErrorResponse(err);
    if (err instanceof EventServiceError && err.code === "INVALID_DATES") {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[events:POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
