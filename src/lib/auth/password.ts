import * as argon2 from "argon2";

/**
 * Hash a plaintext password using argon2id.
 * argon2id is the recommended variant (resists both side-channel and GPU attacks).
 * Parameters are argon2's current recommended defaults.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a plaintext password against a stored hash.
 * Returns true if the password matches, false otherwise.
 * Never throws — wraps any unexpected error as false to prevent
 * timing-based error leakage.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
