import { describe, expect, it } from 'vitest';
import { mergeProgressV2 } from './merge';
import {
  EPOCH_AT, completedMap, fromV1, nextAt, normalizeV2, parseAt, pruneTombstones, replaceCompleted, setDone, TOMBSTONE_TTL_MS,
  type ProgressV2,
} from './model';

// 합성 데이터만 사용한다.
const T = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();
const entry = (done: boolean, n: number) => ({ done, at: T(n) });

/** 시드가 고정된 난수(mulberry32): 새 의존성 없이 재현 가능한 속성 기반 테스트. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 작은 값 집합에서 뽑아 시각 동률(tie)과 같은 항목끼리의 충돌이 자주 생기게 한다. */
const randomProgress = (rand: () => number): ProgressV2 => {
  const out: ProgressV2 = {};
  for (const series of ['s1', 's2', 's3']) {
    if (rand() < 0.2) continue;
    const items: ProgressV2[string] = {};
    for (const item of ['a', 'b', 'c', 'd', 'e']) {
      if (rand() < 0.4) continue;
      items[item] = entry(rand() < 0.5, Math.floor(rand() * 4));
    }
    if (Object.keys(items).length > 0) out[series] = items;
  }
  return out;
};

describe('mergeProgressV2 laws (seeded random data)', () => {
  const rand = rng(20261103);
  const cases = Array.from({ length: 400 }, () => [randomProgress(rand), randomProgress(rand), randomProgress(rand)] as const);

  it('is commutative: merge(a, b) = merge(b, a)', () => {
    for (const [a, b] of cases) expect(mergeProgressV2(a, b)).toEqual(mergeProgressV2(b, a));
  });

  it('is associative: merge(merge(a, b), c) = merge(a, merge(b, c))', () => {
    for (const [a, b, c] of cases) {
      expect(mergeProgressV2(mergeProgressV2(a, b), c)).toEqual(mergeProgressV2(a, mergeProgressV2(b, c)));
    }
  });

  it('is idempotent: merge(a, a) = a, and merging the same side again changes nothing', () => {
    for (const [a, b] of cases) {
      expect(mergeProgressV2(a, a)).toEqual(a);
      const ab = mergeProgressV2(a, b);
      expect(mergeProgressV2(ab, b)).toEqual(ab);
      expect(mergeProgressV2(ab, a)).toEqual(ab);
      expect(mergeProgressV2(ab, ab)).toEqual(ab);
    }
  });

  it('has the empty record as identity and never drops an item id', () => {
    for (const [a, b] of cases) {
      expect(mergeProgressV2(a, {})).toEqual(a);
      expect(mergeProgressV2({}, a)).toEqual(a);
      const merged = mergeProgressV2(a, b);
      for (const [s, items] of Object.entries({ ...a })) for (const id of Object.keys(items)) expect(merged[s][id]).toBeDefined();
    }
  });

  it('converges: replicas that exchange state in any order end up equal', () => {
    for (const [a, b, c] of cases.slice(0, 100)) {
      const orders = [
        mergeProgressV2(mergeProgressV2(a, b), c),
        mergeProgressV2(mergeProgressV2(c, a), b),
        mergeProgressV2(mergeProgressV2(b, c), mergeProgressV2(a, b)),
      ];
      expect(orders[1]).toEqual(orders[0]);
      expect(orders[2]).toEqual(orders[0]);
    }
  });
});

describe('mergeProgressV2 rules', () => {
  it('a newer tombstone beats an older done:true', () => {
    expect(mergeProgressV2({ s: { a: entry(true, 1) } }, { s: { a: entry(false, 2) } })).toEqual({ s: { a: entry(false, 2) } });
  });

  it('a newer done:true beats an older tombstone', () => {
    expect(mergeProgressV2({ s: { a: entry(false, 1) } }, { s: { a: entry(true, 2) } })).toEqual({ s: { a: entry(true, 2) } });
  });

  it('equal at: done:true wins, whichever side it is on', () => {
    expect(mergeProgressV2({ s: { a: entry(true, 5) } }, { s: { a: entry(false, 5) } }).s.a.done).toBe(true);
    expect(mergeProgressV2({ s: { a: entry(false, 5) } }, { s: { a: entry(true, 5) } }).s.a.done).toBe(true);
  });

  it('compares instants, not strings', () => {
    // "…09:00:00+09:00" is 00:00Z, earlier than "…03:00:00Z", although it sorts later as a string.
    const earlier = { s: { a: { done: true, at: '2026-01-01T09:00:00+09:00' } } };
    const later = { s: { a: { done: false, at: '2026-01-01T03:00:00Z' } } };
    expect(mergeProgressV2(earlier, later).s.a).toEqual({ done: false, at: '2026-01-01T03:00:00.000Z' });
    expect(mergeProgressV2(later, earlier).s.a).toEqual({ done: false, at: '2026-01-01T03:00:00.000Z' });
  });

  it('keeps items that only one side has, per series', () => {
    expect(mergeProgressV2({ s1: { a: entry(true, 1) } }, { s1: { b: entry(true, 1) }, s2: { c: entry(false, 1) } })).toEqual({
      s1: { a: entry(true, 1), b: entry(true, 1) },
      s2: { c: entry(false, 1) },
    });
  });

  it('drops entries it cannot read and bad ids instead of failing', () => {
    const dirty = JSON.parse(`{
      "s": { "ok": {"done": true, "at": "2026-01-01T00:00:00Z"}, "badAt": {"done": true, "at": "garbage"},
             "noAt": {"done": true}, "noDone": {"at": "2026-01-01T00:00:00Z"}, "strDone": {"done": "yes", "at": "2026-01-01T00:00:00Z"},
             "num": {"done": true, "at": 5}, "": {"done": true, "at": "2026-01-01T00:00:00Z"}, "__proto__": {"done": true, "at": "2026-01-01T00:00:00Z"} },
      "arr": [], "str": "x", "__proto__": { "x": { "done": true, "at": "2026-01-01T00:00:00Z" } }
    }`);
    expect(mergeProgressV2(dirty, {})).toEqual({ s: { ok: { done: true, at: '2026-01-01T00:00:00.000Z' } } });
    expect(Object.getPrototypeOf(mergeProgressV2(dirty, {}))).toBe(Object.prototype);
    expect(mergeProgressV2('nope', null)).toEqual({});
  });

  it('does not prune: an old tombstone survives a merge (pruning needs "now" and happens only when writing)', () => {
    const old = { s: { a: { done: false, at: EPOCH_AT } } };
    expect(mergeProgressV2(old, {})).toEqual(old);
  });

  it('does not change its inputs', () => {
    const a = { s: { a: entry(true, 1) } };
    const b = { s: { a: entry(false, 2) } };
    const copy = JSON.stringify([a, b]);
    mergeProgressV2(a, b);
    expect(JSON.stringify([a, b])).toBe(copy);
  });
});

describe('model helpers', () => {
  it('parseAt accepts ISO dates and rejects anything Date.parse would guess at', () => {
    expect(parseAt('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1));
    expect(parseAt('2026-01-01')).toBe(Date.UTC(2026, 0, 1));
    for (const bad of ['1', 'tomorrow', '', 5, null, undefined, '2026-13-45T00:00:00Z']) expect(parseAt(bad)).toBeNull();
  });

  it('fromV1 marks every id done at the fixed early time; completedMap gives the old shape back', () => {
    const v2 = fromV1({ s: ['a', 'b'], empty: [] });
    expect(v2).toEqual({ s: { a: { done: true, at: EPOCH_AT }, b: { done: true, at: EPOCH_AT } } });
    expect(completedMap(v2)).toEqual({ s: ['a', 'b'] });
    expect(completedMap({ s: { a: entry(false, 1) } })).toEqual({});
  });

  it('pruneTombstones removes only done:false older than 180 days, and only when asked', () => {
    const now = Date.UTC(2026, 11, 1);
    const day = 24 * 3600 * 1000;
    const at = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
    const p: ProgressV2 = {
      s: { old: { done: false, at: at(181) }, edge: { done: false, at: at(180) }, fresh: { done: false, at: at(10) }, oldDone: { done: true, at: at(400) } },
      gone: { x: { done: false, at: at(500) } },
    };
    expect(TOMBSTONE_TTL_MS).toBe(180 * day);
    expect(pruneTombstones(p, now)).toEqual({ s: { edge: p.s.edge, fresh: p.s.fresh, oldDone: p.s.oldDone } });
  });

  it('setDone stamps strictly after the entry it replaces, even when that entry carries a later (skewed) time', () => {
    const base = Date.UTC(2026, 0, 1);
    const future = { done: true, at: new Date(base + 10_000).toISOString() };
    expect(nextAt(base, future)).toBe(new Date(base + 10_001).toISOString());
    const r = setDone({ s: { a: future } }, 's', ['a'], false, base);
    expect(r.changed).toEqual(['a']);
    expect(r.next.s.a).toEqual({ done: false, at: new Date(base + 10_001).toISOString() });
    expect(mergeProgressV2({ s: { a: future } }, r.next).s.a.done).toBe(false);
  });

  it('setDone leaves untouched what is already in the wanted state, and never invents tombstones', () => {
    const p: ProgressV2 = { s: { a: entry(true, 1) } };
    expect(setDone(p, 's', ['a'], true, Date.now())).toEqual({ next: p, changed: [] });
    expect(setDone(p, 's', ['zzz'], false, Date.now())).toEqual({ next: p, changed: [] });
  });

  it('replaceCompleted turns what disappears into tombstones and revives what the replacement has', () => {
    const base = Date.UTC(2026, 5, 1);
    const current: ProgressV2 = { s: { keep: entry(true, 1), gone: entry(true, 1), back: entry(false, 1) }, other: { x: entry(true, 1) } };
    const next = replaceCompleted(current, { s: ['keep', 'back', 'fresh'] }, base);
    expect(completedMap(next)).toEqual({ s: ['keep', 'back', 'fresh'] });
    expect(next.s.keep).toEqual(entry(true, 1)); // untouched
    expect(next.s.gone).toEqual({ done: false, at: new Date(base).toISOString() }); // tombstone, travels on the next sync
    expect(next.other.x.done).toBe(false);
    // …and the tombstone beats the old done:true that another device still holds.
    expect(mergeProgressV2(next, { s: { gone: entry(true, 1) } }).s.gone.done).toBe(false);
  });

  it('normalizeV2 canonicalises the instant', () => {
    expect(normalizeV2({ s: { a: { done: true, at: '2026-01-01T09:00:00+09:00' } } })).toEqual({ s: { a: { done: true, at: '2026-01-01T00:00:00.000Z' } } });
    expect(normalizeV2([])).toBeNull();
  });
});
