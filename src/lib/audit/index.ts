/**
 * Audit log helper utilities.
 * See blueprint §10 and §17: Non-trivial mutations write an audit record in the same transaction.
 */
import type { Prisma } from "@prisma/client";

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
) {
  return tx.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: (params.payload as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
