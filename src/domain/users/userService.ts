import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

export const RegisterSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128),
  // Role is NOT accepted from the client. Default is participant.
  // Organizer/admin roles are assigned by an admin post-registration.
});

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export class UserServiceError extends Error {
  constructor(
    public readonly code:
      | "EMAIL_TAKEN"
      | "INVALID_CREDENTIALS"
      | "USER_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "UserServiceError";
  }
}

/**
 * Register a new user. Role is always `participant` — never trusted from client input.
 * Returns the new user's ID.
 */
export async function registerUser(
  input: z.infer<typeof RegisterSchema>
): Promise<{ userId: string }> {
  const { email, password } = RegisterSchema.parse(input);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw new UserServiceError("EMAIL_TAKEN", "Email address is already registered.");
  }

  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { email, passwordHash, role: "participant" },
    });
    await tx.auditLog.create({
      data: {
        actorId: newUser.id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: newUser.id,
        payload: { email },
      },
    });
    return newUser;
  });

  return { userId: user.id };
}

/**
 * Login a user. Returns a signed session cookie value on success.
 * Uses constant-time hash verification to prevent user enumeration timing attacks.
 */
export async function loginUser(input: z.infer<typeof LoginSchema>): Promise<{
  signedToken: string;
  userId: string;
  role: Role;
}> {
  const { email, password } = LoginSchema.parse(input);

  const user = await db.user.findUnique({ where: { email } });

  // Always run verifyPassword even if user not found, to prevent
  // timing-based user enumeration attacks.
  const DUMMY_HASH =
    "$argon2id$v=19$m=65536,t=3,p=4$aaaaaaaaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(password, hashToCheck);

  if (!user || !valid) {
    throw new UserServiceError(
      "INVALID_CREDENTIALS",
      "Invalid email or password."
    );
  }

  const signedToken = await createSession(user.id);

  return { signedToken, userId: user.id, role: user.role };
}
