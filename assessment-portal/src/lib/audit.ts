import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

// Every state transition and automated/AI action writes here (§5.13, §15).
export async function audit(
  client: Tx,
  params: {
    entity: string;
    entityId: string;
    action: string;
    actorId?: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await client.auditLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId ?? null,
      before: (params.before ?? null) as Prisma.InputJsonValue,
      after: (params.after ?? null) as Prisma.InputJsonValue,
    },
  });
}

export { prisma };
