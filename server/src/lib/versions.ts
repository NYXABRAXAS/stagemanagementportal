import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { conflict, notFound } from './errors';
import { exportSnapshot, importSnapshot } from './snapshot';

type Tx = Prisma.TransactionClient | typeof prisma;

export const EDITABLE_STATUS = 'DRAFT';

export async function getVersionOrThrow(versionId: string, tx: Tx = prisma) {
  const v = await tx.configVersion.findUnique({ where: { id: versionId }, include: { product: true } });
  if (!v) throw notFound('Configuration version');
  return v;
}

/** Published / submitted versions are immutable. All configuration writes go through this. */
export async function assertDraft(versionId: string, tx: Tx = prisma) {
  const v = await getVersionOrThrow(versionId, tx);
  if (v.status !== EDITABLE_STATUS) {
    throw conflict(
      `Version ${v.versionNo} of ${v.product.name} is ${v.status} and cannot be modified. Create a new draft to make changes.`,
    );
  }
  return v;
}

export async function versionIdOfStage(stageId: string, tx: Tx = prisma) {
  const s = await tx.stage.findUnique({ where: { id: stageId }, select: { versionId: true } });
  if (!s) throw notFound('Stage');
  return s.versionId;
}

export async function versionIdOfSubStage(subStageId: string, tx: Tx = prisma) {
  const s = await tx.subStage.findUnique({ where: { id: subStageId }, select: { stage: { select: { versionId: true } } } });
  if (!s) throw notFound('Sub-stage');
  return s.stage.versionId;
}

export async function versionIdOfModule(moduleId: string, tx: Tx = prisma) {
  const m = await tx.module.findUnique({ where: { id: moduleId }, select: { subStageId: true } });
  if (!m) throw notFound('Module');
  return versionIdOfSubStage(m.subStageId, tx);
}

export async function versionIdOfField(fieldId: string, tx: Tx = prisma) {
  const f = await tx.field.findUnique({ where: { id: fieldId }, select: { subStageId: true } });
  if (!f) throw notFound('Field');
  return versionIdOfSubStage(f.subStageId, tx);
}

export async function latestPublished(productId: string, tx: Tx = prisma) {
  return tx.configVersion.findFirst({ where: { productId, status: 'PUBLISHED' }, orderBy: { versionNo: 'desc' } });
}

export async function currentDraft(productId: string, tx: Tx = prisma) {
  return tx.configVersion.findFirst({
    where: { productId, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
    orderBy: { versionNo: 'desc' },
  });
}

/**
 * Creates a new DRAFT for a product as a deep copy of `basedOnVersionId`
 * (default: latest published, else empty). Only one open draft per product.
 */
export async function createDraft(
  productId: string,
  opts: { basedOnVersionId?: string | null; title?: string; userName?: string; userId?: string },
  tx: Prisma.TransactionClient,
) {
  const open = await currentDraft(productId, tx);
  if (open) throw conflict(`This product already has an open version (v${open.versionNo}, ${open.status}). Continue editing it or withdraw it first.`);
  const base = opts.basedOnVersionId
    ? await tx.configVersion.findUnique({ where: { id: opts.basedOnVersionId } })
    : await latestPublished(productId, tx);
  if (opts.basedOnVersionId && (!base || base.productId !== productId)) throw notFound('Base version for this product');
  const max = await tx.configVersion.aggregate({ where: { productId }, _max: { versionNo: true } });
  const draft = await tx.configVersion.create({
    data: {
      productId,
      versionNo: (max._max.versionNo ?? 0) + 1,
      status: 'DRAFT',
      title: opts.title ?? (base ? `Draft based on v${base.versionNo}` : 'Initial draft'),
      basedOnVersionId: base?.id ?? null,
      createdById: opts.userId ?? null,
      createdByName: opts.userName ?? null,
      lastModifiedByName: opts.userName ?? null,
    },
  });
  if (base) {
    const snap = await exportSnapshot(base.id, tx);
    await importSnapshot(tx, draft.id, snap);
  }
  return draft;
}

/** Records who last modified a draft (shown in version history). */
export async function touchVersion(versionId: string, userName: string | undefined, tx: Tx = prisma) {
  await tx.configVersion.update({ where: { id: versionId }, data: { lastModifiedByName: userName ?? null } });
}
