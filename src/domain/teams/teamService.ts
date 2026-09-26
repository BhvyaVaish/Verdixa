import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireRole, requireAuth } from "@/lib/auth/requireRole";
import type { SessionData } from "@/lib/auth/session";

/** Invite links expire after 48 hours */
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  eventId: z.string().cuid(),
});

export class TeamServiceError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "ALREADY_MEMBER"
      | "INVITE_INVALID"
      | "INVITE_EXPIRED"
      | "INVITE_USED"
      | "EVENT_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "TeamServiceError";
  }
}

/**
 * Create a team for an event. Requires participant role.
 * Creator is automatically added as a member.
 */
export async function createTeam(
  input: z.infer<typeof CreateTeamSchema>,
  session: SessionData | null
): Promise<{ teamId: string }> {
  const validSession = requireRole(session, ["participant"]);
  const { name, eventId } = CreateTeamSchema.parse(input);

  // Verify the event exists
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new TeamServiceError("EVENT_NOT_FOUND", "Event not found.");
  }

  const team = await db.$transaction(async (tx) => {
    const newTeam = await tx.team.create({
      data: {
        name,
        eventId,
        members: {
          create: { userId: validSession.userId },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "TEAM_CREATED",
        entityType: "Team",
        entityId: newTeam.id,
        payload: { name, eventId },
      },
    });

    return newTeam;
  });

  return { teamId: team.id };
}

/**
 * Generate a single-use invite link token for a team.
 * Requires the requester to be a member of the team.
 */
export async function generateInviteToken(
  teamId: string,
  session: SessionData | null
): Promise<{ token: string; expiresAt: Date }> {
  const validSession = requireAuth(session);

  // Verify requester is a member of this team
  const membership = await db.teamMember.findUnique({
    where: {
      teamId_userId: { teamId, userId: validSession.userId },
    },
  });
  if (!membership) {
    throw new TeamServiceError(
      "NOT_FOUND",
      "You are not a member of this team."
    );
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.teamInvite.create({
    data: { teamId, token, createdBy: validSession.userId, expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Accept an invite token. Requires authentication.
 * Token is single-use: marks usedAt on success.
 */
export async function acceptInvite(
  token: string,
  session: SessionData | null
): Promise<{ teamId: string }> {
  const validSession = requireAuth(session);

  const invite = await db.teamInvite.findUnique({
    where: { token },
    include: { team: true },
  });

  if (!invite) {
    throw new TeamServiceError("INVITE_INVALID", "Invite link is invalid.");
  }
  if (invite.usedAt) {
    throw new TeamServiceError(
      "INVITE_USED",
      "This invite link has already been used."
    );
  }
  if (invite.expiresAt < new Date()) {
    throw new TeamServiceError(
      "INVITE_EXPIRED",
      "This invite link has expired."
    );
  }

  // Check if already a member
  const existing = await db.teamMember.findUnique({
    where: {
      teamId_userId: { teamId: invite.teamId, userId: validSession.userId },
    },
  });
  if (existing) {
    throw new TeamServiceError(
      "ALREADY_MEMBER",
      "You are already a member of this team."
    );
  }

  await db.$transaction(async (tx) => {
    await tx.teamMember.create({
      data: { teamId: invite.teamId, userId: validSession.userId },
    });
    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "TEAM_INVITE_ACCEPTED",
        entityType: "Team",
        entityId: invite.teamId,
        payload: { inviteId: invite.id },
      },
    });
  });

  return { teamId: invite.teamId };
}
