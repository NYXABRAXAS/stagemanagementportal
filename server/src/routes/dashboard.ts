import { Router } from 'express';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { requirePermission } from '../middleware/auth';

const r = Router();

r.get(
  '/dashboard',
  requirePermission('config.view'),
  ah(async (req, res) => {
    const products = await prisma.product.findMany({ include: { versions: { select: { id: true, status: true, versionNo: true } } } });
    const versionStatus = await prisma.configVersion.groupBy({ by: ['status'], _count: true });
    const counts = Object.fromEntries(versionStatus.map((v) => [v.status, v._count]));

    // "Configured" = has a published version. "Incomplete" = active product with no published
    // version, or whose working version still has stages without sub-stages / sub-stages without fields.
    const empties = await prisma.$queryRaw<{ productId: string; emptySubs: bigint; emptyStages: bigint; confirm: bigint }[]>`
      SELECT v."productId" as "productId",
        (SELECT count(*) FROM "SubStage" ss JOIN "Stage" s ON ss."stageId" = s.id
          WHERE s."versionId" = v.id AND ss.active AND NOT EXISTS (SELECT 1 FROM "Field" f WHERE f."subStageId" = ss.id)
          AND NOT EXISTS (SELECT 1 FROM "DocumentRequirement" d WHERE d."subStageId" = ss.id)) as "emptySubs",
        (SELECT count(*) FROM "Stage" s WHERE s."versionId" = v.id AND NOT EXISTS (SELECT 1 FROM "SubStage" ss WHERE ss."stageId" = s.id)) as "emptyStages",
        ((SELECT count(*) FROM "Field" f JOIN "SubStage" ss ON f."subStageId" = ss.id JOIN "Stage" s ON ss."stageId" = s.id WHERE s."versionId" = v.id AND f."needsConfirmation")
         + (SELECT count(*) FROM "SubStage" ss JOIN "Stage" s ON ss."stageId" = s.id WHERE s."versionId" = v.id AND ss."needsConfirmation")) as confirm
      FROM "ConfigVersion" v
      WHERE v.status IN ('DRAFT','SUBMITTED','APPROVED','PUBLISHED')`;
    const productRows = products.map((p) => {
      const published = p.versions.find((v) => v.status === 'PUBLISHED');
      const open = p.versions.find((v) => ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(v.status));
      const e = empties.filter((x) => x.productId === p.id);
      const emptySubs = e.reduce((n, x) => n + Number(x.emptySubs), 0);
      const emptyStages = e.reduce((n, x) => n + Number(x.emptyStages), 0);
      const confirm = Math.max(0, ...e.map((x) => Number(x.confirm)));
      return {
        id: p.id, name: p.name, code: p.code, active: p.active,
        published: published?.versionNo ?? null, openVersion: open ? { versionNo: open.versionNo, status: open.status } : null,
        emptySubStages: emptySubs, emptyStages, needsConfirmation: confirm,
        incomplete: p.active && (!published || emptySubs > 0 || emptyStages > 0),
      };
    });
    const recent = req.user!.permissions.includes('audit.view')
      ? await prisma.auditLog.findMany({ where: { NOT: { action: 'LOGIN' } }, orderBy: { at: 'desc' }, take: 12 })
      : [];
    res.json({
      totals: {
        products: products.length,
        activeProducts: products.filter((p) => p.active).length,
        configuredProducts: productRows.filter((p) => p.published).length,
        draftConfigurations: (counts.DRAFT ?? 0) + (counts.SUBMITTED ?? 0) + (counts.APPROVED ?? 0),
        publishedConfigurations: counts.PUBLISHED ?? 0,
        archivedConfigurations: counts.ARCHIVED ?? 0,
        incompleteConfigurations: productRows.filter((p) => p.incomplete).length,
        pendingApproval: (counts.SUBMITTED ?? 0) + (counts.APPROVED ?? 0),
      },
      products: productRows,
      recent,
    });
  }),
);

export default r;
