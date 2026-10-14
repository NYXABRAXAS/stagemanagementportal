/**
 * API integration tests against a freshly migrated + seeded test database.
 * Numbered comments map to the acceptance scenarios in the requirements (Phase 7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/db';

const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Prohorizon@2026';
let app: Express;
const agents: Record<string, request.Agent> = {};

async function login(username: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return agent;
}

beforeAll(async () => {
  app = createApp();
  for (const u of ['admin', 'config.admin', 'config.approver', 'auditor']) agents[u] = await login(u);
});
afterAll(async () => prisma.$disconnect());

const admin = () => agents['config.admin'];
const approver = () => agents['config.approver'];

async function productByCode(code: string) {
  const res = await admin().get('/api/products');
  return res.body.find((p: { code: string }) => p.code === code);
}

describe('authentication', () => {
  it('rejects bad credentials and unauthenticated access', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' })).status).toBe(401);
    expect((await request(app).get('/api/products')).status).toBe(401);
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
  });
  it('returns the user with permissions', async () => {
    const me = await agents.auditor.get('/api/auth/me');
    expect(me.body.user.permissions).toEqual(['audit.view', 'config.view']);
  });
});

describe('seeded catalogue', () => {
  it('has all seven initial products with independent configurations', async () => {
    const res = await admin().get('/api/products');
    const codes = res.body.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['NEW_TWO_WHEELER', 'NEW_CAR', 'USED_CAR', 'NEW_CV', 'USED_CV', 'NEW_TRACTOR', 'USED_TRACTOR']));
    const tw = res.body.find((p: { code: string }) => p.code === 'NEW_TWO_WHEELER');
    const tractor = res.body.find((p: { code: string }) => p.code === 'NEW_TRACTOR');
    expect(tw.published.versionNo).toBe(1);
    expect(tractor.counts.fields).toBeGreaterThan(tw.counts.fields);
  });
});

describe('configuration lifecycle (scenarios 1–14)', () => {
  let productId = '';
  let versionId = '';
  let stageA = '';
  let stageB = '';
  const subs: string[] = [];
  let fieldId = '';
  let dropdownId = '';

  it('1. creates a product (with an empty draft)', async () => {
    const res = await admin().post('/api/products').send({ code: 'TEST_PRODUCT', name: 'Test Product', category: 'Test' });
    expect(res.status).toBe(201);
    productId = res.body.id;
    const versions = await admin().get(`/api/products/${productId}/versions`);
    expect(versions.body).toHaveLength(1);
    expect(versions.body[0].status).toBe('DRAFT');
    versionId = versions.body[0].id;
  });

  it('2. adds stages', async () => {
    const a = await admin().post(`/api/versions/${versionId}/stages`).send({ name: 'Login', platform: 'MOBILE' });
    const b = await admin().post(`/api/versions/${versionId}/stages`).send({ name: 'Credit', platform: 'WEB' });
    expect(a.status).toBe(201);
    expect(a.body.key).toBe('login');
    stageA = a.body.id;
    stageB = b.body.id;
    expect((await admin().post(`/api/versions/${versionId}/stages`).send({ name: 'Login' })).status).toBe(409);
  });

  it('3. adds multiple sub-stages', async () => {
    for (const name of ['Lead Creation', 'Loan Details', 'Application Form']) {
      const r = await admin().post(`/api/stages/${stageA}/subStages`).send({ name });
      expect(r.status).toBe(201);
      subs.push(r.body.id);
    }
    const m = await admin().post(`/api/subStages/${subs[2]}/modules`).send({ name: 'Personal Details' });
    expect(m.status).toBe(201);
  });

  it('4 & 8 & 9. adds fields: mandatory text, optional dropdown with options, conditional field', async () => {
    const f1 = await admin().post(`/api/subStages/${subs[1]}/fields`).send({ label: 'Vehicle Registration Number', type: 'TEXT', requirement: 'MANDATORY', maxLength: 12 });
    expect(f1.status).toBe(201);
    expect(f1.body.key).toBe('vehicleRegistrationNumber');
    fieldId = f1.body.id;
    const f2 = await admin().post(`/api/subStages/${subs[1]}/fields`).send({
      label: 'Customer Type', type: 'DROPDOWN', requirement: 'OPTIONAL',
      options: [{ value: 'Individual', label: 'Individual', active: true }, { value: 'Business', label: 'Business', active: true }],
    });
    expect(f2.body.options.map((o: { value: string }) => o.value)).toEqual(['Individual', 'Business']);
    dropdownId = f2.body.id;
    const f3 = await admin().post(`/api/subStages/${subs[1]}/fields`).send({
      label: 'Business Name', type: 'TEXT', requirement: 'CONDITIONAL',
      rules: [
        { ruleType: 'VISIBILITY', logic: 'ALL', conditions: [{ fieldKey: 'customerType', operator: 'EQUALS', value: 'Business' }], active: true },
        { ruleType: 'REQUIRED', logic: 'ALL', conditions: [{ fieldKey: 'customerType', operator: 'EQUALS', value: 'Business' }], active: true },
      ],
    });
    expect(f3.status).toBe(201);
    // duplicate option values are rejected
    const bad = await admin().put(`/api/fields/${dropdownId}`).send({ options: [{ value: 'A', label: 'A', active: true }, { value: 'A', label: 'B', active: true }] });
    expect(bad.status).toBe(400);
  });

  it('9. edits, reorders and removes dropdown options', async () => {
    const r = await admin().put(`/api/fields/${dropdownId}`).send({
      options: [{ value: 'Business', label: 'Business', active: true }, { value: 'Individual', label: 'Individual (Salaried / Self-employed)', active: true }, { value: 'Trust', label: 'Trust', active: false }],
    });
    expect(r.status).toBe(200);
    expect(r.body.options.map((o: { value: string }) => o.value)).toEqual(['Business', 'Individual', 'Trust']);
    expect(r.body.options[1].label).toContain('Salaried');
  });

  it('5. edits and removes fields', async () => {
    const tmp = await admin().post(`/api/subStages/${subs[1]}/fields`).send({ label: 'Temporary', type: 'INTEGER' });
    const upd = await admin().put(`/api/fields/${tmp.body.id}`).send({ label: 'Temporary Count', minValue: 1, maxValue: 10 });
    expect(upd.body.label).toBe('Temporary Count');
    expect((await admin().put(`/api/fields/${tmp.body.id}`).send({ minValue: 20, maxValue: 10 })).status).toBe(400);
    expect((await admin().delete(`/api/fields/${tmp.body.id}`)).status).toBe(200);
    // a field referenced by another field's rule needs force
    const blocked = await admin().delete(`/api/fields/${dropdownId}`);
    expect(blocked.status).toBe(409);
  });

  it('6. moves a sub-stage to a different stage', async () => {
    const r = await admin().post(`/api/subStages/${subs[2]}/move`).send({ targetStageId: stageB });
    expect(r.status).toBe(200);
    const tree = await admin().get(`/api/versions/${versionId}/tree`);
    const credit = tree.body.stages.find((s: { id: string }) => s.id === stageB);
    expect(credit.subStages.map((s: { name: string }) => s.name)).toContain('Application Form');
    expect(credit.subStages[0].modules[0].name).toBe('Personal Details');
  });

  it('7. reorders stages and fields', async () => {
    expect((await admin().post(`/api/versions/${versionId}/stages/reorder`).send({ orderedIds: [stageB, stageA] })).status).toBe(200);
    let tree = await admin().get(`/api/versions/${versionId}/tree`);
    expect(tree.body.stages.map((s: { name: string }) => s.name)).toEqual(['Credit', 'Login']);
    const loan = tree.body.stages[1].subStages.find((s: { id: string }) => s.id === subs[1]);
    const ids = loan.fields.map((f: { id: string }) => f.id).reverse();
    expect((await admin().post(`/api/subStages/${subs[1]}/fields/reorder`).send({ orderedIds: ids })).status).toBe(200);
    tree = await admin().get(`/api/versions/${versionId}/tree`);
    const loan2 = tree.body.stages[1].subStages.find((s: { id: string }) => s.id === subs[1]);
    expect(loan2.fields.map((f: { id: string }) => f.id)).toEqual(ids);
    expect((await admin().post(`/api/versions/${versionId}/stages/reorder`).send({ orderedIds: [stageA] })).status).toBe(400);
  });

  it('10. previews the form: mandatory, conditional and option validation', async () => {
    let r = await admin().post('/api/preview/validate').send({ versionId, subStageId: subs[1], values: { customerType: 'Individual' } });
    expect(r.body.valid).toBe(false);
    expect(r.body.errors.vehicleRegistrationNumber[0]).toMatch(/required/);
    expect(r.body.visibleKeys).not.toContain('businessName');
    r = await admin().post('/api/preview/validate').send({ versionId, subStageId: subs[1], values: { customerType: 'Business', vehicleRegistrationNumber: 'MP13ZF2011' } });
    expect(r.body.visibleKeys).toContain('businessName');
    expect(r.body.errors.businessName[0]).toMatch(/required/);
    r = await admin().post('/api/preview/validate').send({ versionId, subStageId: subs[1], values: { customerType: 'Business', vehicleRegistrationNumber: 'MP13ZF2011', businessName: 'ACME' } });
    expect(r.body.valid).toBe(true);
    expect(r.body.saved).toBe(false);
  });

  it('validation blocks submission of an invalid configuration', async () => {
    const empty = await admin().post(`/api/stages/${stageB}/subStages`).send({ name: 'Broken' });
    await admin().post(`/api/subStages/${empty.body.id}/fields`).send({ label: 'Calc', type: 'CALCULATED', formula: 'nope + 1' });
    const v = await admin().post(`/api/versions/${versionId}/validate`);
    expect(v.body.valid).toBe(false);
    expect((await admin().post(`/api/versions/${versionId}/submit`)).status).toBe(400);
    await admin().delete(`/api/subStages/${empty.body.id}`);
    expect((await admin().post(`/api/versions/${versionId}/validate`)).body.valid).toBe(true);
  });

  it('14. unauthorised users cannot modify, approve or publish', async () => {
    expect((await agents.auditor.post(`/api/versions/${versionId}/stages`).send({ name: 'Nope' })).status).toBe(403);
    expect((await agents.auditor.put(`/api/fields/${fieldId}`).send({ label: 'x' })).status).toBe(403);
    expect((await approver().post(`/api/versions/${versionId}/stages`).send({ name: 'Nope' })).status).toBe(403);
    expect((await admin().post(`/api/versions/${versionId}/publish`)).status).toBe(403);
    expect((await agents.auditor.get('/api/users')).status).toBe(403);
    expect((await agents.auditor.get('/api/audit')).status).toBe(200);
  });

  it('11. submits, enforces maker-checker, approves and publishes', async () => {
    expect((await admin().post(`/api/versions/${versionId}/submit`).send({ notes: 'first release' })).status).toBe(200);
    // locked while under review
    expect((await admin().put(`/api/fields/${fieldId}`).send({ label: 'Changed' })).status).toBe(409);
    // config.admin cannot approve (no permission); admin cannot approve own submission? admin did not submit → allowed by permission
    expect((await admin().post(`/api/versions/${versionId}/approve`)).status).toBe(403);
    const ap = await approver().post(`/api/versions/${versionId}/approve`);
    expect(ap.status).toBe(200);
    expect(ap.body.approvedByName).toBe('config.approver');
    const pub = await approver().post(`/api/versions/${versionId}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('PUBLISHED');
    expect(pub.body.publishedByName).toBe('config.approver');
  });

  it('maker-checker: the submitter cannot approve their own version', async () => {
    const draft = await agents.admin.post(`/api/products/${productId}/versions`).send({});
    expect(draft.status).toBe(201);
    await agents.admin.post(`/api/versions/${draft.body.id}/submit`);
    const own = await agents.admin.post(`/api/versions/${draft.body.id}/approve`);
    expect(own.status).toBe(403);
    expect(own.body.error).toMatch(/Maker-checker/);
    expect((await agents.admin.post(`/api/versions/${draft.body.id}/reject`).send({ reason: 'test rejection' })).status).toBe(200);
    expect((await agents.admin.delete(`/api/versions/${draft.body.id}`)).status).toBe(200);
  });

  it('published configuration is immutable', async () => {
    expect((await admin().put(`/api/fields/${fieldId}`).send({ label: 'Changed' })).status).toBe(409);
    expect((await admin().post(`/api/versions/${versionId}/stages`).send({ name: 'Late' })).status).toBe(409);
    expect((await admin().delete(`/api/stages/${stageA}`)).status).toBe(409);
  });

  it('13. a new version archives the old one, which stays available and restorable', async () => {
    const d = await admin().post(`/api/products/${productId}/versions`).send({});
    expect(d.status).toBe(201);
    const tree = await admin().get(`/api/versions/${d.body.id}/tree`);
    const login = tree.body.stages.find((s: { key: string }) => s.key === 'login');
    await admin().post(`/api/stages/${login.id}/subStages`).send({ name: 'KYC' });
    const diff = await admin().get(`/api/versions/${d.body.id}/diff`);
    expect(diff.body.summary.added).toBe(1);
    await admin().post(`/api/versions/${d.body.id}/submit`);
    await approver().post(`/api/versions/${d.body.id}/approve`);
    await approver().post(`/api/versions/${d.body.id}/publish`);
    const versions = await admin().get(`/api/products/${productId}/versions`);
    expect(versions.body.map((v: { versionNo: number; status: string }) => `${v.versionNo}:${v.status}`)).toEqual(['2:PUBLISHED', '1:ARCHIVED']);
    const old = await admin().get(`/api/versions/${versionId}/tree`);
    expect(old.status).toBe(200);
    expect(old.body.stages.find((s: { key: string }) => s.key === 'login').subStages.map((s: { name: string }) => s.name)).not.toContain('KYC');
    const rb = await agents.admin.post(`/api/versions/${versionId}/rollback`);
    expect(rb.status).toBe(201);
    expect(rb.body.versionNo).toBe(3);
    expect(rb.body.title).toMatch(/Rollback to v1/);
    const runtime = await admin().get('/api/runtime/products/TEST_PRODUCT/published');
    expect(runtime.body.versionNo).toBe(2);
  });

  it('records audit history with who and what', async () => {
    const a = await agents.auditor.get(`/api/audit?productId=${productId}&pageSize=200`);
    const actions = a.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'DELETE', 'MOVE', 'REORDER', 'SUBMIT', 'APPROVE', 'PUBLISH', 'ROLLBACK']));
    const pub = a.body.items.find((i: { action: string }) => i.action === 'PUBLISH');
    expect(pub.username).toBe('config.approver');
  });
});

describe('product isolation, copy and compare (scenario 12)', () => {
  it('changing Used Car does not change New Car', async () => {
    const usedCar = await productByCode('USED_CAR');
    const newCar = await productByCode('NEW_CAR');
    const before = await admin().get(`/api/versions/${newCar.openVersion.id}/snapshot`);
    const tree = await admin().get(`/api/versions/${usedCar.openVersion.id}/tree`);
    const loan = tree.body.stages[0].subStages.find((s: { key: string }) => s.key === 'loanDetails');
    expect((await admin().post(`/api/subStages/${loan.id}/fields`).send({ label: 'Vehicle Registration Number', type: 'TEXT', requirement: 'MANDATORY' })).status).toBe(201);
    const after = await admin().get(`/api/versions/${newCar.openVersion.id}/snapshot`);
    expect(after.body.stages).toEqual(before.body.stages);
    const preview = await admin().get(`/api/preview/form?versionId=${usedCar.openVersion.id}&subStageId=${loan.id}`);
    expect(preview.body.fields.map((f: { key: string }) => f.key)).toContain('vehicleRegistrationNumber');
  });

  it('copies a field to another product only after confirmation, into a draft', async () => {
    const usedCar = await productByCode('USED_CAR');
    const newCar = await productByCode('NEW_CAR');
    const body = { sourceVersionId: usedCar.openVersion.id, items: [{ type: 'field', ref: 'login/loanDetails', fieldKey: 'vehicleRegistrationNumber' }], targetProductIds: [newCar.id] };
    const prev = await admin().post('/api/copy').send(body);
    expect(prev.body.preview[0].actions[0].op).toBe('ADD_FIELD');
    let snap = await admin().get(`/api/versions/${newCar.openVersion.id}/snapshot`);
    const has = (s: typeof snap) => s.body.stages[0].subStages.find((x: { key: string }) => x.key === 'loanDetails').fields.some((f: { key: string }) => f.key === 'vehicleRegistrationNumber');
    expect(has(snap)).toBe(false); // preview did not write anything
    expect((await agents.auditor.post('/api/copy').send({ ...body, confirm: true })).status).toBe(403);
    const applied = await admin().post('/api/copy').send({ ...body, confirm: true });
    expect(applied.status).toBe(200);
    snap = await admin().get(`/api/versions/${newCar.openVersion.id}/snapshot`);
    expect(has(snap)).toBe(true);
  });

  it('copying into a product with only a published version creates a draft and leaves the published version unchanged', async () => {
    const tractor = await productByCode('NEW_TRACTOR');
    const used = await productByCode('USED_TRACTOR');
    const pubBefore = await admin().get(`/api/versions/${used.published.id}/snapshot`);
    const res = await admin().post('/api/copy').send({ sourceVersionId: tractor.published.id, items: [{ type: 'subStage', ref: 'login/loanDetails' }], targetProductIds: [used.id], conflictMode: 'REPLACE', confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.applied[0].draftVersionNo).toBe(2);
    const pubAfter = await admin().get(`/api/versions/${used.published.id}/snapshot`);
    expect(pubAfter.body.stages).toEqual(pubBefore.body.stages);
  });

  it('compares two product configurations', async () => {
    const tw = await productByCode('NEW_TWO_WHEELER');
    const tractor = await productByCode('NEW_TRACTOR');
    const c = await admin().get(`/api/compare?a=${tw.published.id}&b=${tractor.published.id}`);
    expect(c.status).toBe(200);
    expect(c.body.entries.some((e: { kind: string; path: string }) => e.kind === 'added' && e.path === 'login/fvr')).toBe(true);
    expect(c.body.entries.some((e: { kind: string; path: string }) => e.kind === 'removed' && e.path === 'login/scoreCard')).toBe(true);
  });

  it('clones a product with preview then confirm', async () => {
    const tractor = await productByCode('NEW_TRACTOR');
    const prev = await admin().post(`/api/products/${tractor.id}/clone`).send({ code: 'NEW_TRACTOR_PILOT', name: 'New Tractor Pilot' });
    expect(prev.body.preview.fields).toBeGreaterThan(500);
    expect(await productByCode('NEW_TRACTOR_PILOT')).toBeUndefined();
    const done = await admin().post(`/api/products/${tractor.id}/clone`).send({ code: 'NEW_TRACTOR_PILOT', name: 'New Tractor Pilot', confirm: true, includeSchemes: true });
    expect(done.status).toBe(201);
    const p = await productByCode('NEW_TRACTOR_PILOT');
    expect(p.counts.fields).toBe(prev.body.preview.fields);
    expect(p.schemes).toHaveLength(1);
  });
});

describe('workflow, documents and roles', () => {
  it('manages workflow transitions and documents in a draft', async () => {
    const car = await productByCode('NEW_CAR');
    const tree = await admin().get(`/api/versions/${car.openVersion.id}/tree`);
    const subs = tree.body.stages.flatMap((s: { subStages: { id: string; key: string }[] }) => s.subStages);
    const from = subs.find((s: { key: string }) => s.key === 'kyc');
    const to = subs.find((s: { key: string }) => s.key === 'duplicateCheck');
    const t = await admin().post(`/api/versions/${car.openVersion.id}/transitions`).send({ fromSubStageId: from.id, toSubStageId: to.id, actionCode: 'CREATE_LEAD', actionLabel: 'Create lead', outcome: 'SUBMIT', allowedRoleCodes: ['SALES_OFFICER'], remarksRequired: true });
    expect(t.status).toBe(201);
    const pv = await admin().post('/api/preview/validate').send({ versionId: car.openVersion.id, subStageId: from.id, values: {}, roleCode: 'CAM_USER' });
    const act = pv.body.actions.find((a: { actionLabel: string }) => a.actionLabel === 'Create lead');
    expect(act.available).toBe(false);
    expect(act.blockers.join(' ')).toMatch(/not allowed/);
    const d = await admin().post(`/api/versions/${car.openVersion.id}/documents`).send({ subStageId: from.id, code: 'VOTER_ID', name: 'Voter ID', requirement: 'OPTIONAL' });
    expect(d.status).toBe(201);
    expect((await admin().delete(`/api/documents/${d.body.id}`)).status).toBe(200);
  });

  it('allows adding roles and changing permissions (system admin only)', async () => {
    const r = await agents.admin.post('/api/roles').send({ code: 'VALUATION_USER', name: 'Valuation User', roleType: 'LOS' });
    expect(r.status).toBe(201);
    expect((await admin().post('/api/roles').send({ code: 'X_ROLE', name: 'X' })).status).toBe(403);
    const roles = await agents.admin.get('/api/roles');
    const auditor = roles.body.find((x: { code: string }) => x.code === 'AUDITOR');
    expect((await agents.admin.put(`/api/roles/${auditor.id}/permissions`).send({ permissions: ['config.view'] })).status).toBe(200);
    const fresh = await login('auditor');
    expect((await fresh.get('/api/audit')).status).toBe(403); // enforced immediately on the backend
    await agents.admin.put(`/api/roles/${auditor.id}/permissions`).send({ permissions: ['config.view', 'audit.view'] });
  });
});
