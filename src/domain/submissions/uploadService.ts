import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/requireRole";
import type { SessionData } from "@/lib/auth/session";
import { SubmissionServiceError } from "./submissionService";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Blueprint §7: No MinIO, local volume only. Validate extension + sniff MIME.
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Basic magic byte signatures for common image formats
const MAGIC_BYTES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [0x47, 0x49, 0x46, 0x38], // GIF8
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF (first 4 bytes), followed by WEBP at offset 8
};

function checkMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 8) return null;

  if (buffer[0] === MAGIC_BYTES.jpeg[0] && buffer[1] === MAGIC_BYTES.jpeg[1] && buffer[2] === MAGIC_BYTES.jpeg[2]) {
    return "image/jpeg";
  }
  if (
    buffer[0] === MAGIC_BYTES.png[0] && buffer[1] === MAGIC_BYTES.png[1] &&
    buffer[2] === MAGIC_BYTES.png[2] && buffer[3] === MAGIC_BYTES.png[3]
  ) {
    return "image/png";
  }
  if (
    buffer[0] === MAGIC_BYTES.gif[0] && buffer[1] === MAGIC_BYTES.gif[1] &&
    buffer[2] === MAGIC_BYTES.gif[2] && buffer[3] === MAGIC_BYTES.gif[3]
  ) {
    return "image/gif";
  }
  if (
    buffer[0] === MAGIC_BYTES.webp[0] && buffer[1] === MAGIC_BYTES.webp[1] &&
    buffer[2] === MAGIC_BYTES.webp[2] && buffer[3] === MAGIC_BYTES.webp[3] &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50 // "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export async function validateAndSaveUpload(
  file: File,
  projectId: string,
  session: SessionData | null
) {
  const validSession = requireAuth(session);

  // 1. Verify project exists and caller is team member
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { teamId: true, eventId: true, status: true, lockedAt: true, event: { select: { submissionDeadline: true } } },
  });

  if (!project) {
    throw new SubmissionServiceError("NOT_FOUND", "Project not found.");
  }

  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId: project.teamId, userId: validSession.userId } },
  });

  if (!membership) {
    throw new SubmissionServiceError("FORBIDDEN", "You are not a member of this team.");
  }

  // 2. Check if project is editable
  if (project.status === "submitted" || project.lockedAt) {
    throw new SubmissionServiceError("ALREADY_SUBMITTED", "Project is locked.");
  }

  const now = new Date();
  if (project.event.submissionDeadline && now > project.event.submissionDeadline) {
    throw new SubmissionServiceError("DEADLINE_PASSED", "Submission deadline has passed.");
  }

  // 3. Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File exceeds 5MB limit.");
  }
  if (file.size === 0) {
    throw new Error("File is empty.");
  }

  // 4. Validate extension
  const originalName = file.name || "upload";
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("Invalid file extension. Only images allowed.");
  }

  // 5. Read into buffer to sniff MIME
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = checkMagicBytes(buffer);

  if (!mimeType) {
    throw new Error("Invalid file content. Magic bytes do not match expected image formats.");
  }

  // 6. Save to local volume using a randomized filename
  const filename = `${randomUUID()}${ext}`;
  // Save relatively inside the UPLOADS_DIR
  const storagePath = filename; 

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

  // 7. Write MediaAsset record
  return db.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        projectId,
        filename,
        originalName,
        mimeType,
        sizeBytes: file.size,
        storagePath,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: validSession.userId,
        action: "MEDIA_UPLOADED",
        entityType: "MediaAsset",
        entityId: asset.id,
        payload: { projectId, originalName, mimeType, sizeBytes: file.size },
      },
    });

    return asset;
  });
}
