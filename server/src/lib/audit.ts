import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Tx = Prisma.TransactionClient | typeof prisma;

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  productId?: string | null;
  versionId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function audit(req: Request | null, input: AuditInput, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      userId: req?.user?.id ?? null,
      username: req?.user?.username ?? 'system',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      productId: input.productId ?? null,
      versionId: input.versionId ?? null,
      summary: input.summary,
      before: json(input.before),
      after: json(input.after),
      ip: req?.ip ?? null,
    },
  });
}
