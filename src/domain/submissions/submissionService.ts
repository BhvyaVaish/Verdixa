import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { requireRole, requireAuth } from "@/lib/auth/requireRole";
import type { SessionData } from "@/lib/auth/session";
import type { ProjectStatus } from "@prisma/client";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  repoUrl: z.string().url().optional().or(z.literal("")),
  demoUrl: z.string().url().optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  teamId: z.string().min(1),
  eventId: z.string().min(1),
  trackId: z.string().optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  repoUrl: z.string().url().optional().or(z.literal("")),
  demoUrl: z.string().url().optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  trackId: z.string().optional(),
});

// ─── Error type ───────────────────────────────────────────────────────────────

export class SubmissionServiceError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "DEADLINE_PASSED"
      | "ALREADY_SUBMITTED"
      | "DUPLICATE_SUBMISSION"
      | "INVALID_STATUS"
      | "EVENT_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "SubmissionServiceError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify that the user is a member of the given team.
 * Returns the teamMember record if valid.
 */
async function assertTeamMember(userId: string, teamId: string) {
  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership) {
    throw new SubmissionServiceError(
      "FORBIDDEN",
      "You are not a member of this team."
    );
  }
  return membership;
}

/**
 * Server-side deadline check. Never reads a timestamp from the request body.
 * Throws DEADLINE_PASSED if the event's submissionDeadline has passed.
 */
async function assertDeadlineNotPassed(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { submissionDeadline: true, status: true },
  });
  if (!event) {
    throw new SubmissionServiceError("EVENT_NOT_FOUND", "Event not found.");
  }
  const now = new Date();
  if (event.submissionDeadline && now > event.submissionDeadline) {
    throw new SubmissionServiceError(
      "DEADLINE_PASSED",
      `Submission deadline passed at ${event.submissionDeadline.toISOString()}.`
    );
  }
  if (event.status === "closed" || event.status === "judging") {
    throw new SubmissionServiceError(
      "DEADLINE_PASSED",
      "This event is no longer accepting submissions."
    );
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Create a new project (draft). One per team per event — enforced by unique constraint.
 * Caller must be a team member.
 */
export async function createProject(
  data: z.infer<typeof CreateProjectSchema>,
  session: SessionData | null
) {
  const validSession = requireAuth(session);
  await assertTeamMember(validSession.userId, data.teamId);
  await assertDeadlineNotPassed(data.eventId);

  // Verify team belongs to the event
  const team = await db.team.findUnique({
    where: { id: data.teamId },
    select: { eventId: true },
  });
  if (!team || team.eventId !== data.eventId) {
    throw new SubmissionServiceError(
      "FORBIDDEN",
      "Team does not belong to this event."
    );
  }

  return db.$transaction(async (tx) => {
    // Check for existing submission (belt-and-suspenders alongside unique constraint)
    const existing = await tx.project.findUnique({
      where: { teamId_eventId: { teamId: data.teamId, eventId: data.eventId } },
    });
    if (existing) {
      throw new SubmissionServiceError(
        "DUPLICATE_SUBMISSION",
        "This team already has a project in this event."
      );
    }

    const project = await tx.project.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        repoUrl: data.repoUrl || null,
        demoUrl: data.demoUrl || null,
        videoUrl: data.videoUrl || null,
        teamId: data.teamId,
        eventId: data.eventId,
        trackId: data.trackId ?? null,
        status: "draft",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "PROJECT_CREATED",
        entityType: "Project",
        entityId: project.id,
        payload: { title: data.title, teamId: data.teamId, eventId: data.eventId },
      },
    });

    return project;
  });
}

/**
 * Update a project's editable fields.
 * Blocked if: caller is not a team member, submission is already locked,
 * or the event's submissionDeadline has passed.
 */
export async function updateProject(
  projectId: string,
  data: z.infer<typeof UpdateProjectSchema>,
  session: SessionData | null
) {
  const validSession = requireAuth(session);

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { teamId: true, eventId: true, status: true, lockedAt: true },
  });
  if (!project) {
    throw new SubmissionServiceError("NOT_FOUND", "Project not found.");
  }

  await assertTeamMember(validSession.userId, project.teamId);

  if (project.status === "submitted" || project.lockedAt) {
    throw new SubmissionServiceError(
      "ALREADY_SUBMITTED",
      "This project has been finalized and cannot be edited."
    );
  }

  // Server-side deadline check — not the client's problem to calculate
  await assertDeadlineNotPassed(project.eventId);

  return db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        title: data.title,
        description: data.description,
        repoUrl: data.repoUrl ?? undefined,
        demoUrl: data.demoUrl ?? undefined,
        videoUrl: data.videoUrl ?? undefined,
        trackId: data.trackId ?? undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "PROJECT_UPDATED",
        entityType: "Project",
        entityId: projectId,
        payload: data,
      },
    });

    return updated;
  });
}

/**
 * Lock a project as submitted. Irreversible after deadline.
 * Blocked if: caller is not a team member, already locked, or deadline passed.
 */
export async function finalizeProject(
  projectId: string,
  session: SessionData | null
) {
  const validSession = requireAuth(session);

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { teamId: true, eventId: true, status: true, lockedAt: true },
  });
  if (!project) {
    throw new SubmissionServiceError("NOT_FOUND", "Project not found.");
  }

  await assertTeamMember(validSession.userId, project.teamId);

  if (project.status === "submitted" || project.lockedAt) {
    throw new SubmissionServiceError(
      "ALREADY_SUBMITTED",
      "This project is already finalized."
    );
  }

  // Server checks deadline before accepting the finalize request
  await assertDeadlineNotPassed(project.eventId);

  const now = new Date();

  return db.$transaction(async (tx) => {
    const finalized = await tx.project.update({
      where: { id: projectId },
      data: {
        status: "submitted",
        submittedAt: now,
        lockedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "PROJECT_FINALIZED",
        entityType: "Project",
        entityId: projectId,
        payload: { submittedAt: now.toISOString() },
      },
    });

    return finalized;
  });
}

/**
 * Get a project by ID.
 * Team members get the full record. All others get a public-safe subset
 * (only if the project is submitted). Drafts are team-private.
 */
export async function getProject(
  projectId: string,
  session: SessionData | null
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      mediaAssets: { select: { id: true, filename: true, mimeType: true } },
      track: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (!project) {
    throw new SubmissionServiceError("NOT_FOUND", "Project not found.");
  }

  // Check if requester is a team member
  const isMember = session
    ? !!(await db.teamMember.findUnique({
        where: {
          teamId_userId: { teamId: project.teamId, userId: session.userId },
        },
      }))
    : false;

  if (isMember) {
    return { project, accessLevel: "member" as const };
  }

  // Non-members can only see submitted projects
  if (project.status !== "submitted") {
    throw new SubmissionServiceError(
      "FORBIDDEN",
      "This project is not publicly visible yet."
    );
  }

  return { project, accessLevel: "public" as const };
}

/**
 * List projects owned by the current user's teams.
 */
export async function listMyProjects(session: SessionData | null) {
  const validSession = requireAuth(session);

  const memberships = await db.teamMember.findMany({
    where: { userId: validSession.userId },
    select: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  return db.project.findMany({
    where: { teamId: { in: teamIds } },
    include: {
      team: { select: { id: true, name: true } },
      event: { select: { id: true, name: true, submissionDeadline: true } },
      track: { select: { id: true, name: true } },
      _count: { select: { mediaAssets: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
