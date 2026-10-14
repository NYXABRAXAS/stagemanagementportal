import type { Snapshot, SnapField, SnapStage, SnapSubStage } from './snapshot';
import { subRef } from './snapshot';

export type ChangeKind = 'added' | 'removed' | 'changed';
export interface PropChange { prop: string; from: unknown; to: unknown }
export interface DiffEntry {
  kind: ChangeKind;
  level: 'stage' | 'subStage' | 'module' | 'field' | 'document' | 'transition';
  path: string;
  label: string;
  changes?: PropChange[];
}
export interface DiffResult {
  entries: DiffEntry[];
  summary: { added: number; removed: number; changed: number };
}

const IGNORE = new Set(['subStages', 'modules', 'fields']);

function compareProps(a: Record<string, unknown>, b: Record<string, unknown>): PropChange[] {
  const out: PropChange[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    const av = JSON.stringify(a[k] ?? null);
    const bv = JSON.stringify(b[k] ?? null);
    if (av !== bv) out.push({ prop: k, from: a[k] ?? null, to: b[k] ?? null });
  }
  return out;
}

function byKey<T>(list: T[], key: (t: T) => string) {
  return new Map(list.map((x) => [key(x), x]));
}

function diffMaps<T>(
  a: Map<string, T>,
  b: Map<string, T>,
  level: DiffEntry['level'],
  label: (t: T) => string,
  out: DiffEntry[],
  onBoth?: (k: string, x: T, y: T) => void,
) {
  for (const [k, x] of a) {
    if (!b.has(k)) out.push({ kind: 'removed', level, path: k, label: label(x) });
  }
  for (const [k, y] of b) {
    const x = a.get(k);
    if (!x) {
      out.push({ kind: 'added', level, path: k, label: label(y) });
      continue;
    }
    const changes = compareProps(x as Record<string, unknown>, y as Record<string, unknown>);
    if (changes.length) out.push({ kind: 'changed', level, path: k, label: label(y), changes });
    onBoth?.(k, x, y);
  }
}

/** Structural diff from snapshot `a` (old) to snapshot `b` (new), matched by keys. */
export function diffSnapshots(a: Snapshot, b: Snapshot): DiffResult {
  const out: DiffEntry[] = [];
  diffMaps<SnapStage>(byKey(a.stages, (s) => s.key), byKey(b.stages, (s) => s.key), 'stage', (s) => s.name, out, (sk, sa, sb) => {
    diffMaps<SnapSubStage>(
      byKey(sa.subStages, (s) => subRef(sk, s.key)),
      byKey(sb.subStages, (s) => subRef(sk, s.key)),
      'subStage',
      (s) => `${sb.name} › ${s.name}`,
      out,
      (ssk, ssa, ssb) => {
        diffMaps(
          byKey(ssa.modules, (m) => `${ssk}#${m.key}`),
          byKey(ssb.modules, (m) => `${ssk}#${m.key}`),
          'module',
          (m) => `${sb.name} › ${ssb.name} › ${m.name}`,
          out,
        );
        diffMaps<SnapField>(
          byKey(ssa.fields, (f) => `${ssk}.${f.key}`),
          byKey(ssb.fields, (f) => `${ssk}.${f.key}`),
          'field',
          (f) => `${sb.name} › ${ssb.name} › ${f.label}`,
          out,
        );
      },
    );
  });
  // Sub-stages that moved between stages show up as removed + added, which is accurate for audit.
  diffMaps(
    byKey(a.documents, (d) => `${d.subStageRef ?? '-'}:${d.code}`),
    byKey(b.documents, (d) => `${d.subStageRef ?? '-'}:${d.code}`),
    'document',
    (d) => d.name,
    out,
  );
  diffMaps(
    byKey(a.transitions, (t) => `${t.fromRef}:${t.actionCode}:${t.toRef ?? '-'}`),
    byKey(b.transitions, (t) => `${t.fromRef}:${t.actionCode}:${t.toRef ?? '-'}`),
    'transition',
    (t) => `${t.fromRef} —${t.actionLabel}→ ${t.toRef ?? '(end)'}`,
    out,
  );
  const summary = { added: 0, removed: 0, changed: 0 };
  out.forEach((e) => summary[e.kind]++);
  return { entries: out, summary };
}
