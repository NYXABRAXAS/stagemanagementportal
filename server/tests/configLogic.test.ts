import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/lib/diff';
import { validateSnapshot } from '../src/lib/validateConfig';
import { planCopy } from '../src/routes/copy';
import { losSnapshot, starterSnapshot } from '../prisma/seed-data/los';
import { buildSnapshot, dd, text } from '../prisma/seed-data/dsl';

describe('source-derived seed configurations', () => {
  it('Two Wheeler, New Tractor and Used Tractor baselines have no blocking errors', () => {
    for (const v of ['TW', 'NEW_TRACTOR', 'USED_TRACTOR'] as const) {
      const r = validateSnapshot(losSnapshot(v));
      expect(r.errors, `${v}: ${JSON.stringify(r.errors.slice(0, 3))}`).toHaveLength(0);
    }
  });

  it('Two Wheeler journey follows the OPTIM Lead Journey (no FVR / PD, has Score Card)', () => {
    const login = losSnapshot('TW').stages.find((s) => s.key === 'login')!;
    expect(login.subStages.map((s) => s.key)).toEqual([
      'leadCreation', 'mobileVerification', 'kyc', 'duplicateCheck', 'bureau', 'loanDetails', 'scoreCard', 'documentUpload', 'applicationForm',
    ]);
  });

  it('Tractor journey follows the manual (FVR and PD before Loan Details)', () => {
    const login = losSnapshot('NEW_TRACTOR').stages.find((s) => s.key === 'login')!;
    const keys = login.subStages.map((s) => s.key);
    expect(keys.indexOf('fvr')).toBeLessThan(keys.indexOf('personalDiscussion'));
    expect(keys.indexOf('personalDiscussion')).toBeLessThan(keys.indexOf('loanDetails'));
    expect(keys).not.toContain('scoreCard');
  });

  it('Tractor fields are not copied into the starter templates', () => {
    const starter = starterSnapshot('New Car');
    const all = starter.stages.flatMap((s) => s.subStages.flatMap((ss) => ss.fields.map((f) => f.key)));
    expect(all).not.toContain('tractorHp');
    expect(all).not.toContain('cropName');
    expect(starter.stages.every((s) => s.needsConfirmation)).toBe(true);
  });
});

describe('configuration validator', () => {
  it('reports duplicate keys, empty dropdowns, missing conditional rules and bad formulas', () => {
    expect(() =>
      buildSnapshot([{ key: 's', name: 'S', subs: [{ key: 'a', name: 'A', platform: 'WEB', src: 't', fields: [text('Name', { key: 'x' }), text('Dup', { key: 'x' })] }] }], [], []),
    ).toThrow(/duplicate field key/);
    const ok = buildSnapshot([{ key: 's', name: 'S', subs: [{ key: 'a', name: 'A', platform: 'WEB', src: 't', fields: [dd('Type', [], { key: 'type', nc: false }), text('Calc', { key: 'calc' })] }] }], [], []);
    ok.stages[0].subStages[0].fields[1].type = 'CALCULATED';
    ok.stages[0].subStages[0].fields[1].formula = 'unknownField + 1';
    ok.stages[0].subStages[0].fields[0].requirement = 'CONDITIONAL';
    const r = validateSnapshot(ok);
    const msgs = r.errors.map((e) => e.message).join(' | ');
    expect(msgs).toMatch(/no active options/);
    expect(msgs).toMatch(/unknown field "unknownField"/);
    expect(msgs).toMatch(/no "required when" rule/);
  });
});

describe('diff', () => {
  it('detects added, removed and changed items by key', () => {
    const a = losSnapshot('TW');
    const b = JSON.parse(JSON.stringify(a));
    const ld = b.stages[0].subStages.find((s: { key: string }) => s.key === 'loanDetails');
    ld.fields.push({ ...ld.fields[0], key: 'vehicleRegistrationNumber', label: 'Vehicle Registration Number' });
    ld.fields[1].requirement = 'MANDATORY';
    b.stages.pop();
    const d = diffSnapshots(a, b);
    expect(d.entries.some((e) => e.kind === 'added' && e.path.endsWith('.vehicleRegistrationNumber'))).toBe(true);
    expect(d.entries.some((e) => e.kind === 'changed' && e.changes?.some((c) => c.prop === 'requirement'))).toBe(true);
    expect(d.entries.some((e) => e.kind === 'removed' && e.level === 'stage')).toBe(true);
  });
});

describe('copy planning', () => {
  it('plans add / skip / replace without touching the source', () => {
    const src = losSnapshot('NEW_TRACTOR');
    const target = starterSnapshot('New Car');
    const plan = planCopy(src, target, { items: [{ type: 'subStage', ref: 'login/fvr' }, { type: 'subStage', ref: 'login/kyc' }], conflictMode: 'SKIP' });
    expect(plan.actions.find((a) => a.op === 'ADD_SUBSTAGE')?.target).toMatch(/FVR/);
    expect(plan.actions.find((a) => a.op === 'SKIP_SUBSTAGE')?.target).toMatch(/KYC/);
    const replace = planCopy(src, target, { items: [{ type: 'subStage', ref: 'login/kyc' }], conflictMode: 'REPLACE' });
    expect(replace.actions[0].op).toBe('REPLACE_SUBSTAGE');
    const field = planCopy(src, target, { items: [{ type: 'field', ref: 'login/loanDetails', fieldKey: 'chassisNumber' }], conflictMode: 'SKIP' });
    expect(field.actions.map((a) => a.op)).toEqual(['ADD_FIELD']);
  });
});
