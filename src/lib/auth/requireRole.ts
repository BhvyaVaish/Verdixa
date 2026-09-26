import type { Role } from "@prisma/client";
import type { SessionData } from "./session";

/**
 * Custom error thrown when a session is missing or a role check fails.
 * Route handlers should catch this and return a 401 or 403 response.
 */
export class AuthorizationError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    message: string
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * The single, authoritative role check used at the top of every sensitive
 * Route Handler and Server Action.
 *
 * NEVER duplicate this logic inline. NEVER substitute a UI-level check for this.
 * See blueprint §8 and §17.
 *
 * @param session - The session object from getSession(), or null if unauthenticated.
 * @param allowedRoles - The roles permitted to perform this action.
 * @returns The validated session (narrowed to non-null).
 * @throws AuthorizationError(401) if session is null (unauthenticated).
 * @throws AuthorizationError(403) if role is not in allowedRoles (authenticated but forbidden).
 */
export function requireRole(
  session: SessionData | null,
  allowedRoles: Role[]
): SessionData {
  if (!session) {
    throw new AuthorizationError(401, "Authentication required.");
  }
  if (!allowedRoles.includes(session.role)) {
    throw new AuthorizationError(
      403,
      `Role '${session.role}' is not permitted. Required: ${allowedRoles.join(", ")}.`
    );
  }
  return session;
}

/**
 * Convenience helper for handlers that only require any authenticated session
 * (no specific role check beyond "logged in").
 */
export function requireAuth(session: SessionData | null): SessionData {
  if (!session) {
    throw new AuthorizationError(401, "Authentication required.");
  }
  return session;
}

/**
 * Convert an AuthorizationError into a standard JSON response for use in Route Handlers.
 */
export function authErrorResponse(err: AuthorizationError): Response {
  return Response.json(
    { error: err.message },
    { status: err.statusCode }
  );
}
