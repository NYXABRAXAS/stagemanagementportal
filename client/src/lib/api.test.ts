import { describe, expect, it } from 'vitest';
import { qs } from './api';
import { validateForm } from '../../../shared/src/ruleEngine';

describe('qs', () => {
  it('skips empty values and encodes the rest', () => {
    expect(qs({ a: 'x y', b: '', c: undefined, d: 0, e: false })).toBe('?a=x+y&d=0&e=false');
    expect(qs({})).toBe('');
  });
});

describe('shared rule engine is usable from the client bundle', () => {
  it('validates a mandatory field', () => {
    const r = validateForm([{ key: 'x', label: 'X', type: 'TEXT', requirement: 'MANDATORY' }], {});
    expect(r.errors.x[0]).toBe('X is required.');
  });
});
