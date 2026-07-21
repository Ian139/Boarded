import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDisplayGrade,
  canonicalizeGrade,
  gradeToNumber,
  numberToGrade,
  normalizeRouteGrades,
} from './grades';

describe('canonicalizeGrade', () => {
  it('canonicalizes case and surrounding whitespace', () => {
    assert.equal(canonicalizeGrade('  v0  '), 'V0');
    assert.equal(canonicalizeGrade(' vb'), 'VB');
    assert.equal(canonicalizeGrade('v17\t'), 'V17');
  });

  it('maps integral numeric wire values independently of rank indexes', () => {
    assert.equal(canonicalizeGrade(-1), 'VB');
    assert.equal(canonicalizeGrade(0), 'V0');
    assert.equal(canonicalizeGrade(17), 'V17');
    assert.equal(numberToGrade(0), 'VB');
  });

  it('rejects invalid, fractional, and out-of-range values', () => {
    for (const value of [null, undefined, '', 'V18', 'not-a-grade', 0.5, -1.5, -2, 18, NaN, Infinity]) {
      assert.equal(canonicalizeGrade(value), undefined, `expected ${String(value)} to be unranked`);
    }
  });
});

describe('grade calculations', () => {
  it('returns a canonical setter grade when there are no ascents', () => {
    assert.equal(calculateDisplayGrade('  v4  ', []), 'V4');
    assert.equal(calculateDisplayGrade('v4'), 'V4');
    assert.equal(calculateDisplayGrade(undefined, []), undefined);
  });

  it('blends setter and ascent grades at equal weight', () => {
    assert.equal(calculateDisplayGrade('V4', [{ grade_v: 'V6' }]), 'V5');
    assert.equal(calculateDisplayGrade('V4', [{ grade_v: 'V6' }, { grade_v: 'V6' }]), 'V5');
  });

  it('ignores unranked ascents and still calculates ranked ascents', () => {
    assert.equal(calculateDisplayGrade(undefined, [{ grade_v: 'V2' }, { grade_v: 0.5 }]), 'V2');
    assert.equal(gradeToNumber(0), 1);
    assert.equal(gradeToNumber(-1), 0);
    assert.equal(gradeToNumber(17), 18);
  });
});

describe('normalizeRouteGrades', () => {
  it('normalizes route and nested ascent numeric/string grades at ingress', () => {
    const route = {
      id: 'route-1',
      user_id: 'user-1',
      wall_id: 'wall-1',
      name: 'Numeric route',
      grade_v: 0,
      holds: [],
      is_public: true,
      view_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ascents: [
        {
          id: 'ascent-1',
          route_id: 'route-1',
          user_id: 'user-2',
          grade_v: -1,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ascent-2',
          route_id: 'route-1',
          user_id: 'user-3',
          grade_v: ' v17 ',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ascent-3',
          route_id: 'route-1',
          user_id: 'user-4',
          grade_v: 1.25,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    } as unknown as Parameters<typeof normalizeRouteGrades>[0];

    const normalized = normalizeRouteGrades(route);
    assert.equal(normalized.grade_v, 'V0');
    assert.deepEqual(normalized.ascents?.map((ascent) => ascent.grade_v), ['VB', 'V17', undefined]);
    assert.equal(normalized.name, route.name);
  });
});
