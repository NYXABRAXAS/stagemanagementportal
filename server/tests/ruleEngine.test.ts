import { describe, expect, it } from 'vitest';
import {
  applyCalculations, evaluateCondition, evaluateFormula, isEditable, isRequired, isVisible, resolveDateToken, validateForm, type FieldLike,
} from '../../shared/src/ruleEngine';

const f = (o: Partial<FieldLike> & { key: string }): FieldLike => ({ label: o.key, type: 'TEXT', requirement: 'OPTIONAL', ...o });

describe('conditions', () => {
  it('evaluates operators', () => {
    const v = { type: 'Business', amt: '150', list: ['A', 'B'], empty: '' };
    expect(evaluateCondition({ fieldKey: 'type', operator: 'EQUALS', value: 'business' }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'type', operator: 'NOT_EQUALS', value: 'Individual' }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'type', operator: 'IN', value: ['Individual', 'Business'] }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'type', operator: 'NOT_IN', value: 'Individual, Trust' }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'amt', operator: 'GREATER_THAN', value: 100 }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'amt', operator: 'LESS_OR_EQUAL', value: 150 }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'empty', operator: 'IS_EMPTY' }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'list', operator: 'CONTAINS', value: 'b' }, v)).toBe(true);
    expect(evaluateCondition({ fieldKey: 'missing', operator: 'GREATER_THAN', value: 1 }, v)).toBe(false);
  });
});

describe('visibility and requiredness', () => {
  const customerType = f({ key: 'customerType', type: 'DROPDOWN', options: [{ value: 'Individual', label: 'Individual' }, { value: 'Business', label: 'Business' }] });
  const businessName = f({
    key: 'businessName', requirement: 'CONDITIONAL',
    rules: [
      { ruleType: 'VISIBILITY', conditions: [{ fieldKey: 'customerType', operator: 'EQUALS', value: 'Business' }] },
      { ruleType: 'REQUIRED', conditions: [{ fieldKey: 'customerType', operator: 'EQUALS', value: 'Business' }] },
    ],
  });

  it('shows Business Details only for Business customers', () => {
    expect(isVisible(businessName, { customerType: 'Individual' })).toBe(false);
    expect(isVisible(businessName, { customerType: 'Business' })).toBe(true);
  });

  it('conditional requiredness follows the REQUIRED rule', () => {
    expect(isRequired(businessName, { customerType: 'Business' })).toBe(true);
    expect(isRequired(businessName, { customerType: 'Individual' })).toBe(false);
  });

  it('hidden fields are not validated', () => {
    expect(validateForm([customerType, businessName], { customerType: 'Individual' }).valid).toBe(true);
    const r = validateForm([customerType, businessName], { customerType: 'Business' });
    expect(r.valid).toBe(false);
    expect(r.errors.businessName[0]).toMatch(/required/);
  });

  it('respects scheme and role applicability', () => {
    const x = f({ key: 'x', schemeCodes: ['S1'], visibleRoleCodes: ['SO'], editableRoleCodes: ['SO'] });
    expect(isVisible(x, {}, { schemeCode: 'S2' })).toBe(false);
    expect(isVisible(x, {}, { schemeCode: 'S1', roleCode: 'SO' })).toBe(true);
    expect(isVisible(x, {}, { roleCode: 'CAM_USER' })).toBe(false);
    expect(isEditable(x, { roleCode: 'CAM_USER' })).toBe(false);
    expect(isEditable(f({ key: 'r', readOnly: true }))).toBe(false);
  });
});

describe('field validation', () => {
  it('validates numbers, lengths, patterns and options', () => {
    const fields = [
      f({ key: 'amount', type: 'CURRENCY', requirement: 'MANDATORY', minValue: 1000, maxValue: 500000 }),
      f({ key: 'tenure', type: 'INTEGER', minValue: 1 }),
      f({ key: 'pan', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', patternMessage: 'Bad PAN' }),
      f({ key: 'name', minLength: 2, maxLength: 5 }),
      f({ key: 'freq', type: 'DROPDOWN', options: [{ value: 'Monthly', label: 'Monthly' }] }),
    ];
    const r = validateForm(fields, { amount: '50', tenure: '1.5', pan: 'ABCDE1234', name: 'TOOLONGNAME', freq: 'Weekly' });
    expect(r.errors.amount[0]).toMatch(/at least 1000/);
    expect(r.errors.tenure[0]).toMatch(/whole number/);
    expect(r.errors.pan).toEqual(['Bad PAN']);
    expect(r.errors.name[0]).toMatch(/at most 5/);
    expect(r.errors.freq[0]).toMatch(/not in the list/);
    expect(validateForm(fields, { amount: '150000', pan: 'AZOPL6288L', name: 'Abc', freq: 'Monthly' }).valid).toBe(true);
  });

  it('enforces mandatory checkbox and date restrictions', () => {
    const consent = f({ key: 'consent', type: 'CHECKBOX', requirement: 'MANDATORY' });
    expect(validateForm([consent], { consent: false }).valid).toBe(false);
    expect(validateForm([consent], { consent: true }).valid).toBe(true);
    const dob = f({ key: 'dob', type: 'DATE', dateMax: 'today-18y' });
    expect(validateForm([dob], { dob: '2020-01-01' }).valid).toBe(false);
    expect(validateForm([dob], { dob: '11-12-1997' }).valid).toBe(true);
  });

  it('resolves relative date tokens', () => {
    const now = new Date(2026, 9, 15);
    expect(resolveDateToken('today', now)?.getDate()).toBe(15);
    expect(resolveDateToken('today+30d', now)?.getMonth()).toBe(10);
    expect(resolveDateToken('today-18y', now)?.getFullYear()).toBe(2008);
    expect(resolveDateToken('2026-01-31')?.getMonth()).toBe(0);
  });
});

describe('calculated fields', () => {
  it('evaluates formulas safely, matching the OPTIM Two Wheeler screen values', () => {
    const fields = [
      f({ key: 'assetCost', type: 'CURRENCY' }), f({ key: 'discount', type: 'CURRENCY' }),
      f({ key: 'exShowRoomPrice', type: 'CALCULATED', formula: 'assetCost - discount' }),
      f({ key: 'roadTax', type: 'CURRENCY' }), f({ key: 'insuranceAmount', type: 'CURRENCY' }), f({ key: 'registrationCharges', type: 'CURRENCY' }), f({ key: 'otherCharges', type: 'CURRENCY' }),
      f({ key: 'onRoadPrice', type: 'CALCULATED', formula: 'exShowRoomPrice + roadTax + insuranceAmount + registrationCharges + otherCharges' }),
    ];
    const out = applyCalculations(fields, { assetCost: '1,50,000', discount: '1000', roadTax: 2500, insuranceAmount: 2000, registrationCharges: 1000, otherCharges: 200 });
    expect(out.exShowRoomPrice).toBe(149000);
    expect(out.onRoadPrice).toBe(154700);
  });

  it('supports precedence and brackets, rejects code', () => {
    expect(evaluateFormula('(a + b) * 2 / 4', { a: 1, b: 3 })).toBe(2);
    expect(evaluateFormula('-a + 10', { a: 4 })).toBe(6);
    expect(() => evaluateFormula('process.exit()', {})).toThrow();
    expect(() => evaluateFormula('a +', { a: 1 })).toThrow();
  });
});
