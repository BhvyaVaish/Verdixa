import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireRole";
import type { SessionData } from "@/lib/auth/session";
import type { EventStatus } from "@prisma/client";

export const CreateEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  /// ISO datetime string — server stores and enforces this. Client timestamp never trusted.
  submissionDeadline: z.string().datetime().optional(),
  tracks: z.array(z.string().min(1).max(100)).max(20).optional(),
});

export class EventServiceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_DATES" | "FORBIDDEN",
    message: string
  ) {
    super(message);
    this.name = "EventServiceError";
  }
}

/**
 * Create a new event. Requires organizer or admin role.
 * Writes audit log in same transaction.
 */
export async function createEvent(
  input: z.infer<typeof CreateEventSchema>,
  session: SessionData | null
): Promise<{ eventId: string }> {
  // Permission check FIRST — before any other work
  const validSession = requireRole(session, ["organizer", "admin"]);

  const { name, description, startDate, endDate, submissionDeadline, tracks } =
    CreateEventSchema.parse(input);

  if (new Date(endDate) <= new Date(startDate)) {
    throw new EventServiceError(
      "INVALID_DATES",
      "End date must be after start date."
    );
  }

  const event = await db.$transaction(async (tx) => {
    const newEvent = await tx.event.create({
      data: {
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        submissionDeadline: submissionDeadline
          ? new Date(submissionDeadline)
          : null,
        organizerId: validSession.userId,
        tracks: tracks?.length
          ? { create: tracks.map((t) => ({ name: t })) }
          : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "EVENT_CREATED",
        entityType: "Event",
        entityId: newEvent.id,
        payload: { name, startDate, endDate },
      },
    });

    return newEvent;
  });

  return { eventId: event.id };
}

/**
 * Get an event by ID. Public — no auth required.
 */
export async function getEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { tracks: true, organizer: { select: { id: true, email: true } } },
  });
  if (!event) {
    throw new EventServiceError("NOT_FOUND", "Event not found.");
  }
  return event;
}

/**
 * List all events. Public — no auth required.
 */
export async function listEvents(status?: EventStatus) {
  return db.event.findMany({
    where: status ? { status } : undefined,
    include: { tracks: true },
    orderBy: { startDate: "asc" },
  });
}
