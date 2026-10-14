/**
 * Seeds a clean database with:
 *  - permissions, portal roles and the LOS business roles from the Tractor manual (§2)
 *  - demo users (local development only — change passwords before any shared use)
 *  - the 7 products, observed schemes, and their initial configurations:
 *      New Two Wheeler  → v1 PUBLISHED  (source baseline from the OPTIM screenshots)
 *      New Tractor      → v1 PUBLISHED  (source baseline from the Tractor manual)
 *      Used Tractor     → v1 PUBLISHED  (Tractor manual; used-asset specifics flagged)
 *      Cars / CVs       → v1 DRAFT      (starter template — requires confirmation)
 *
 * Idempotent for reference data (roles, permissions, users, products). Configuration
 * versions are only created for products that have none, so re-running never
 * overwrites configuration edited through the portal.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { importSnapshot, type Snapshot } from '../src/lib/snapshot';
import { losSnapshot, starterSnapshot } from './seed-data/los';
import { SETTING_DEFAULTS } from '../src/lib/settings';

const prisma = new PrismaClient();
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Prohorizon@2026';

const PERMISSIONS: [string, string, string][] = [
  ['config.view', 'View configuration', 'Configuration'],
  ['config.create', 'Create configuration items and drafts', 'Configuration'],
  ['config.edit', 'Edit configuration items', 'Configuration'],
  ['config.delete', 'Delete configuration items / discard drafts', 'Configuration'],
  ['config.submit', 'Submit a draft for approval', 'Versioning'],
  ['config.approve', 'Approve or reject a submitted version', 'Versioning'],
  ['config.publish', 'Publish an approved version / restore older versions', 'Versioning'],
  ['audit.view', 'View audit history', 'Audit'],
  ['product.manage', 'Create / edit / activate products and schemes', 'Administration'],
  ['role.manage', 'Manage roles and permissions', 'Administration'],
  ['user.manage', 'Manage portal users', 'Administration'],
  ['settings.manage', 'Change system settings', 'Administration'],
];

const ALL = PERMISSIONS.map((p) => p[0]);
const EDIT = ['config.view', 'config.create', 'config.edit', 'config.delete', 'config.submit', 'audit.view'];

// [code, name, type, platform, permissions, description, sourceRef]
const ROLES: [string, string, 'PORTAL' | 'LOS', string | null, string[], string, string][] = [
  ['SYSTEM_ADMIN', 'System Administrator', 'PORTAL', null, ALL, 'Full access to the portal, users, roles and settings.', 'Requirement'],
  ['CONFIG_ADMIN', 'Configuration Administrator', 'PORTAL', null, [...EDIT, 'product.manage'], 'Builds products, stages, fields, documents and workflow; submits drafts.', 'Requirement'],
  ['CONFIG_APPROVER', 'Configuration Approver', 'PORTAL', null, ['config.view', 'config.approve', 'config.publish', 'audit.view'], 'Reviews diffs, approves and publishes configuration versions.', 'Requirement'],
  ['AUDITOR', 'Read-only Auditor', 'PORTAL', null, ['config.view', 'audit.view'], 'Read-only access to configuration and audit history.', 'Requirement'],
  ['SALES_OFFICER', 'Sales Officer', 'LOS', 'Mobile App', [], 'Lead creation through pre-disbursement documents — the customer-facing journey.', 'Manual §2'],
  ['DUPLICATE_REVIEWER', 'Duplicate Check Reviewer', 'LOS', 'Web Portal', [], 'Reviews system-flagged duplicate leads and accepts or rejects the application.', 'Manual §2'],
  ['DUE_DILIGENCE', 'Due Diligence User', 'LOS', 'Web Portal', [], 'Validates KYC / onboarding documents and closes or reopens the Due Diligence task.', 'Manual §2'],
  ['CAM_USER', 'CAM Preparation User', 'LOS', 'Web Portal', [], 'Prepares the Credit Appraisal Memo, validates income, initiates FI/TVR.', 'Manual §2'],
  ['RCU_USER', 'RCU User', 'LOS', 'Web Portal', [], 'Validates scheme-related documents in parallel with CAM.', 'Manual §2'],
  ['FI_USER', 'FI User / Agency', 'LOS', 'Web Portal / External', [], 'Completes the Field Investigation questionnaire.', 'Manual §2'],
  ['TVR_USER', 'TVR User / Agency', 'LOS', 'Web Portal / External', [], 'Completes the Telephonic / Residence Verification questionnaire.', 'Manual §2'],
  ['CREDIT_APPROVER', 'Credit Approval User', 'LOS', 'Web Portal', [], 'In-Principle Approval, Credit Decisioning, Credit Approve / Loan Decline (Credit L0–L5; authority matrix to be confirmed).', 'Manual §2'],
  ['DEVIATION_APPROVER', 'Deviation User (Credit-L1)', 'LOS', 'Web Portal', [], 'Approves or rejects system-generated credit deviations.', 'Manual §2'],
  ['RELOOK_USER', 'Relook User', 'LOS', 'Web Portal', [], 'Reviews declined cases in the Relook Queue.', 'Manual §2'],
  ['ASM', 'ASM (Area Sales Manager)', 'LOS', 'Web Portal', [], 'Recommends on Deal Structure deviations (no final approval authority).', 'Manual §2'],
  ['BUSINESS_USER', 'Business User', 'LOS', 'Web Portal', [], 'Final approval / rejection of Business (rate) deviations.', 'Manual §2'],
  ['QC_MAKER', 'QC Maker', 'LOS', 'Web Portal', [], 'First-line validation of pre-disbursement documents.', 'Manual §2'],
  ['QC_CHECKER', 'QC Checker', 'LOS', 'Web Portal', [], 'Second-line (final) validation of pre-disbursement documents.', 'Manual §2'],
  ['DISBURSEMENT_USER', 'Disbursement User', 'LOS', 'Web Portal', [], 'Reviews and updates the final disbursement amount.', 'Manual §2'],
  ['AUTH_USER', 'Auth User', 'LOS', 'Web Portal', [], 'Final authorisation and Final Disbursement (CIF, Loan Account, GL Account).', 'Manual §2'],
  ['SYSTEM_ENGINE', 'System / Rule Engine', 'LOS', 'System', [], 'Automatic steps: Duplicate engine, Bureau engine, auto-deviations.', 'Manual §7–8, §20.1'],
];

const USERS: [string, string, string[]][] = [
  ['admin', 'System Administrator', ['SYSTEM_ADMIN']],
  ['config.admin', 'Configuration Administrator', ['CONFIG_ADMIN']],
  ['config.approver', 'Configuration Approver', ['CONFIG_APPROVER']],
  ['auditor', 'Read-only Auditor', ['AUDITOR']],
];

// [code, name, category, sortOrder, source note, schemes, config]
type Cfg = 'TW' | 'NEW_TRACTOR' | 'USED_TRACTOR' | 'STARTER';
const PRODUCTS: [string, string, string, number, string, [string, string][], Cfg][] = [
  ['NEW_TWO_WHEELER', 'New Two Wheeler', 'Two Wheeler', 10, 'Configuration derived from the OPTIM Two Wheeler screenshots (optimscreen.zip).', [['TW-NIP', 'TW-NIP']], 'TW'],
  ['NEW_CAR', 'New Car', 'Car', 20, 'No source walkthrough available — starter template. Scheme NC-NIP observed in OPTIM web queues.', [['NC-NIP', 'NC-NIP']], 'STARTER'],
  ['USED_CAR', 'Used Car', 'Car', 30, 'No source walkthrough available — starter template. Scheme UC-NIP observed in OPTIM web queues.', [['UC-NIP', 'UC-NIP']], 'STARTER'],
  ['NEW_CV', 'New Commercial Vehicle', 'Commercial Vehicle', 40, 'No source material — starter template.', [], 'STARTER'],
  ['USED_CV', 'Used Commercial Vehicle', 'Commercial Vehicle', 50, 'No source material — starter template.', [], 'STARTER'],
  ['NEW_TRACTOR', 'New Tractor', 'Tractor', 60, 'Configuration derived from the Tractor Loan End-to-End User Manual v1.0.', [['KV_NEW_TRACTOR_LITE', 'Kisan Vahan New Tractor (Lite)']], 'NEW_TRACTOR'],
  ['USED_TRACTOR', 'Used Tractor', 'Tractor', 70, 'Tractor manual journey; used-asset specifics not documented separately (flagged).', [['KV_USED_TRACTOR_LITE', 'Kisan Vahan Used Tractor (Lite)'], ['KV_USED_TRACTOR_PRO', 'Kisan Vahan Used Tractor (Pro)']], 'USED_TRACTOR'],
];

async function main() {
  console.log('Seeding permissions & roles…');
  for (const [code, name, module] of PERMISSIONS)
    await prisma.permission.upsert({ where: { code }, update: { name, module }, create: { code, name, module } });
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const [code, name, roleType, platform, rolePerms, description, sourceRef] of ROLES) {
    const existing = await prisma.role.findUnique({ where: { code } });
    const role = await prisma.role.upsert({
      where: { code },
      update: { name, roleType, platform, description, sourceRef, isSystem: true },
      create: { code, name, roleType, platform, description, sourceRef, isSystem: true },
    });
    if (!existing) // never overwrite a permission matrix an administrator has changed
      await prisma.rolePermission.createMany({ data: rolePerms.map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })), skipDuplicates: true });
  }

  console.log('Seeding demo users…');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const [username, fullName, roles] of USERS) {
    if (await prisma.user.findUnique({ where: { username } })) continue;
    const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
    await prisma.user.create({ data: { username, fullName, passwordHash: hash, roles: { create: roleRows.map((r) => ({ roleId: r.id })) } } });
  }

  for (const [key, d] of Object.entries(SETTING_DEFAULTS))
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value: d.value, description: d.description, updatedBy: 'seed' } });

  console.log('Seeding products & configurations…');
  for (const [code, name, category, sortOrder, sourceNote, schemes, cfg] of PRODUCTS) {
    const product = await prisma.product.upsert({ where: { code }, update: {}, create: { code, name, category, sortOrder, sourceNote, description: sourceNote } });
    for (const [scode, sname] of schemes)
      await prisma.scheme.upsert({
        where: { productId_code: { productId: product.id, code: scode } }, update: {},
        create: { productId: product.id, code: scode, name: sname, sourceRef: cfg === 'TW' ? 'OPTIM screenshots' : cfg === 'STARTER' ? 'OPTIM web queue (#26–#27)' : 'Manual §1 / OPTIM web queue' },
      });
    if ((await prisma.configVersion.count({ where: { productId: product.id } })) > 0) {
      console.log(`  ${name}: configuration already present — left unchanged`);
      continue;
    }
    const snap: Snapshot = cfg === 'STARTER' ? starterSnapshot(name) : losSnapshot(cfg);
    const publish = cfg !== 'STARTER';
    await prisma.$transaction(
      async (tx) => {
        const v = await tx.configVersion.create({
          data: {
            productId: product.id, versionNo: 1, status: publish ? 'PUBLISHED' : 'DRAFT',
            title: publish ? 'Source baseline (seeded) — pending business confirmation' : 'Starter template (seeded) — requires confirmation',
            notes: sourceNote, createdByName: 'seed', lastModifiedByName: 'seed',
            ...(publish ? { submittedByName: 'seed', submittedAt: new Date(), approvedByName: 'seed', approvedAt: new Date(), publishedByName: 'seed', publishedAt: new Date() } : {}),
          },
        });
        await importSnapshot(tx, v.id, snap);
        await tx.auditLog.create({
          data: { username: 'seed', action: publish ? 'SEED_PUBLISH' : 'SEED_DRAFT', entityType: 'ConfigVersion', entityId: v.id, productId: product.id, versionId: v.id, summary: `Seeded ${name} v1 (${publish ? 'published source baseline' : 'starter draft'})` },
        });
      },
      { timeout: 180000 },
    );
    const fields = snap.stages.reduce((n, s) => n + s.subStages.reduce((m, ss) => m + ss.fields.length, 0), 0);
    console.log(`  ${name}: ${snap.stages.length} stages, ${snap.stages.reduce((n, s) => n + s.subStages.length, 0)} sub-stages, ${fields} fields, ${snap.documents.length} documents, ${snap.transitions.length} transitions`);
  }
  console.log('\nSeed complete. Demo users: admin, config.admin, config.approver, auditor (password: see README / SEED_DEMO_PASSWORD).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
