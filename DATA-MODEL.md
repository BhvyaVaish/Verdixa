# VERDIXA — Data Model Documentation

> Canonical field-level documentation for the active Prisma schema.
> Current through **Phase 1-2 (T1 Core)**. Updated incrementally at the conclusion of each phase.

---

## Active Schema Overview

### 1. Identity & Sessions (Slice A)

#### `User`
Primary identity entity. Roles are strictly server-owned and cannot be upgraded via client requests.
- `id`: CUID unique identifier.
- `email`: Unique login handle.
- `passwordHash`: Argon2id hash (never plaintext, never md5/sha1/bcrypt).
- `role`: Enum (`participant`, `judge`, `organizer`, `admin`).
- `createdAt`, `updatedAt`: Timestamps.

#### `Session`
Server-side session record for fast revocation on logout.
- `id`: CUID identifier.
- `userId`: Foreign key to `User`.
- `token`: 32-byte opaque random token (or deterministic token in seeded fixtures).
- `expiresAt`: Absolute session expiry (7 days from creation).

---

### 2. Events & Tracks (Slice A)

#### `Event`
Hackathon event boundary.
- `id`: CUID identifier.
- `name`: Human-readable event title.
- `description`: Optional markdown event overview.
- `startDate`, `endDate`: Official run window.
- `submissionDeadline`: Authoritative server-side deadline cutoff. Evaluated directly against the server clock; client timestamps are never trusted.
- `status`: Enum (`draft`, `open`, `judging`, `closed`).
- `organizerId`: Foreign key to `User` (must possess `organizer` or `admin` role).

#### `Track`
Optional competition track or challenge category within an event.
- `id`: CUID identifier.
- `name`: Track label.
- `eventId`: Foreign key to `Event`.

---

### 3. Teams & Membership (Slice A)

#### `Team`
Team formation unit. Teams exist only within a specific event context.
- `id`: CUID identifier.
- `name`: Unique team name within the event.
- `eventId`: Foreign key to `Event`.

#### `TeamMember`
Composite relationship table enforcing unique membership.
- `id`: CUID identifier.
- `teamId`: Foreign key to `Team`.
- `userId`: Foreign key to `User`.
- Unique constraint: `[teamId, userId]`.

#### `TeamInvite`
Single-use join link generator.
- `id`: CUID identifier.
- `teamId`: Foreign key to `Team`.
- `token`: Cryptographically secure 24-byte URL-safe string.
- `createdBy`: Foreign key to `User` who created the link.
- `usedAt`: Nullable timestamp; set atomically upon acceptance to prevent reuse.
- `expiresAt`: 48-hour TTL.

---

### 4. Submissions & Media (Slice B — ADR-002)

#### `Project`
A team's hackathon project submission. Enforces a single submission per team per event via `@@unique([teamId, eventId])`.
- `id`: CUID identifier.
- `title`: Project title.
- `description`: Markdown project description.
- `repoUrl`, `demoUrl`, `videoUrl`: External project resource links.
- `status`: Enum (`draft`, `submitted`, `disqualified`).
- `submittedAt`: Timestamp recorded upon explicit finalization.
- `lockedAt`: Timestamp recorded when editing is permanently locked.
- `teamId`: Foreign key to `Team`.
- `eventId`: Foreign key to `Event`.
- `trackId`: Optional foreign key to `Track`.

#### `MediaAsset`
Locally stored project screenshots. Mitigates remote object-storage complexity and attack surface.
- `id`: CUID identifier.
- `projectId`: Foreign key to `Project`.
- `filename`: Randomized UUID string (e.g. `a1b2c3d4-e5f6.webp`) preventing path traversal and script execution.
- `originalName`: User-supplied filename stored purely for UI display.
- `mimeType`: Sniffed from first 8 magic bytes; untrusted client `Content-Type` is discarded.
- `sizeBytes`: Enforced server-side against a 5MB maximum limit.
- `storagePath`: Path relative to the local Docker volume root.

---

### 5. Audit & Compliance

#### `AuditLog`
Immutable transactional record written alongside every non-trivial mutation.
- `id`: CUID identifier.
- `actorId`: Foreign key to `User` (or null for public actions).
- `action`: Audit action code (`EVENT_CREATED`, `USER_REGISTERED`, `TEAM_CREATED`, `TEAM_INVITE_ACCEPTED`, `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_FINALIZED`, `MEDIA_UPLOADED`).
- `entityType`: Target entity name (`Event`, `Team`, `Project`, etc.).
- `entityId`: Target record ID.
- `payload`: Structured JSON snapshot of modified values.
- `createdAt`: Immutable timestamp.
