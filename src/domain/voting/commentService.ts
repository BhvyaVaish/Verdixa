/**
 * Comment Service (ADR-004 / Phase 5)
 */
import { db } from "@/lib/db";

const BODY_MAX_LEN = 2000;

/** Post a new comment on a project. */
export async function addComment(
  projectId: string,
  authorId: string,
  body: string
): Promise<{ ok: boolean; error?: string; commentId?: string }> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length === 0) return { ok: false, error: "body_empty" };
  if (trimmed.length > BODY_MAX_LEN) return { ok: false, error: "body_too_long" };

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "project_not_found" };

  const comment = await db.comment.create({
    data: { projectId, authorId, body: trimmed },
  });

  await db.auditLog.create({
    data: {
      actorId: authorId,
      action: "COMMENT_POSTED",
      entityType: "Comment",
      entityId: comment.id,
      payload: { projectId, bodyLength: trimmed.length },
    },
  });

  return { ok: true, commentId: comment.id };
}

/** List visible comments for a project (public view). */
export async function getProjectComments(projectId: string) {
  return db.comment.findMany({
    where: { projectId, status: "visible" },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** List ALL comments for a project, including hidden (organizer view). */
export async function getAllProjectComments(projectId: string) {
  return db.comment.findMany({
    where: { projectId },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Organizer hides a comment with a reason. */
export async function hideComment(
  commentId: string,
  actorId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) return { ok: false, error: "not_found" };
  if (comment.status === "hidden") return { ok: false, error: "already_hidden" };

  await db.comment.update({
    where: { id: commentId },
    data: { status: "hidden", hideReason: reason },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: "COMMENT_HIDDEN",
      entityType: "Comment",
      entityId: commentId,
      payload: { reason, projectId: comment.projectId, authorId: comment.authorId },
    },
  });

  return { ok: true };
}

/** Organizer restores a hidden comment. */
export async function restoreComment(
  commentId: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) return { ok: false, error: "not_found" };

  await db.comment.update({
    where: { id: commentId },
    data: { status: "visible", hideReason: null },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: "COMMENT_RESTORED",
      entityType: "Comment",
      entityId: commentId,
      payload: { projectId: comment.projectId },
    },
  });

  return { ok: true };
}
