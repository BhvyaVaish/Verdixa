import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

/** Session duration: 7 days */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cookie name used throughout the app */
export const SESSION_COOKIE_NAME = "verdixa_session";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.startsWith("CHANGE_ME")) {
    // Fail hard at startup if SESSION_SECRET is still the default.
    // This prevents "works in dev, broken in prod" silent failures.
    throw new Error(
      "[auth] SESSION_SECRET environment variable is not set or is still the default. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return secret;
}

/**
 * Sign a token with HMAC-SHA256 so we can detect tampering without a DB lookup.
 * Format: `token.hmac`
 */
function sign(token: string): string {
  const hmac = createHmac("sha256", getSecret())
    .update(token)
    .digest("hex");
  return `${token}.${hmac}`;
}

/**
 * Verify a signed token. Returns the raw token if valid, null if tampered/invalid.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function unsign(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;

  const token = signed.slice(0, lastDot);
  const providedHmac = signed.slice(lastDot + 1);

  const expectedHmac = createHmac("sha256", getSecret())
    .update(token)
    .digest("hex");

  try {
    const a = Buffer.from(providedHmac, "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * The session object returned to callers after a successful getSession() call.
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  role: Role;
}

/**
 * Create a new server-side session for the given user.
 * Returns the signed cookie value to set on the response.
 */
export async function createSession(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId,
      token: rawToken,
      expiresAt,
    },
  });

  return sign(rawToken);
}

/**
 * Look up and validate a session from a signed cookie value.
 * Returns SessionData if valid and unexpired, null otherwise.
 * Invalid or expired sessions are cleaned up eagerly.
 */
export async function getSession(
  signedCookie: string | undefined
): Promise<SessionData | null> {
  if (!signedCookie) return null;

  const rawToken = unsign(signedCookie);
  if (!rawToken) return null;

  const session = await db.session.findUnique({
    where: { token: rawToken },
    include: { user: { select: { id: true, role: true } } },
  });

  if (!session) return null;

  // Expired session — clean it up and reject
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    role: session.user.role,
  };
}

/**
 * Destroy a session by its signed cookie value. Idempotent.
 */
export async function destroySession(signedCookie: string): Promise<void> {
  const rawToken = unsign(signedCookie);
  if (!rawToken) return;
  await db.session.deleteMany({ where: { token: rawToken } });
}

/**
 * Build the Set-Cookie header string for the session cookie.
 */
export function buildSessionCookie(
  signedToken: string,
  options?: { clear?: boolean }
): string {
  if (options?.clear) {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
  }
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${signedToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;
}

/**
 * Extract the raw session cookie value from a Cookie header string.
 */
export function extractSessionCookie(
  cookieHeader: string | null
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.slice(SESSION_COOKIE_NAME.length + 1) : undefined;
}
