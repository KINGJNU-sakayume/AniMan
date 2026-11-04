import { describe, expect, it } from 'vitest';
import { mergeProgressV2 } from './merge';
import { EPOCH_AT, type ProgressV2 } from './model';
import { itemsDeletedElsewhere, planStaleReview, removeItems } from './staleReview';

// 합성 데이터만 사용한다.
const F = Date.UTC(2026, 0, 1, 12);
const at = (offsetMs: number) => new Date(F + offsetMs).toISOString();
const done = (offsetMs: number) => ({ done: true, at: at(offsetMs) });
const gone = (offsetMs: number) => ({ done: false, at: at(offsetMs) });
const keys = (list: { seriesId: string; itemId: string }[]) => list.map((i) => `${i.seriesId}/${i.itemId}`).sort();

describe('itemsDeletedElsewhere (at ≤ F and no entry on the server)', () => {
  it('lists an unchanged item the server no longer has', () => {
    expect(keys(itemsDeletedElsewhere({ s: { a: done(-1000) } }, { s: { other: done(0) } }, F))).toEqual(['s/a']);
  });

  it('at exactly F counts as unchanged; one millisecond later is an offline edit and stays', () => {
    const local = { s: { atF: done(0), after: done(1) } };
    expect(keys(itemsDeletedElsewhere(local, {}, F))).toEqual(['s/atF']);
  });

  it('covers done:true and done:false (tombstone) alike, and reports which it was', () => {
    const found = itemsDeletedElsewhere({ s: { up: done(-5), down: gone(-5) } }, {}, F);
    expect(found.map((i) => [i.itemId, i.done]).sort()).toEqual([['down', false], ['up', true]]);
  });

  it('a tombstone alone on the server counts as "present": normal merge handles that case', () => {
    const local = { s: { a: done(-1000) } };
    const server = { s: { a: gone(-500) } };
    expect(itemsDeletedElsewhere(local, server, F)).toEqual([]);
    expect(mergeProgressV2(local, server).s.a.done).toBe(false);
  });

  it('judges per item: a series that exists on the server can still lack the item', () => {
    expect(keys(itemsDeletedElsewhere({ s: { a: done(-1), b: done(-1) } }, { s: { a: done(-1) } }, F))).toEqual(['s/b']);
    expect(keys(itemsDeletedElsewhere({ s: { a: done(-1) }, t: { x: done(-1) } }, { s: { a: done(-1) } }, F))).toEqual(['t/x']);
  });

  it('items converted from v1 (EPOCH_AT) follow the same rule', () => {
    const local = { s: { missing: { done: true, at: EPOCH_AT }, kept: { done: true, at: EPOCH_AT } } };
    expect(keys(itemsDeletedElsewhere(local, { s: { kept: done(0) } }, F))).toEqual(['s/missing']);
  });

  it('ignores entries whose time cannot be read instead of removing them', () => {
    const local = { s: { weird: { done: true, at: 'nonsense' } } } as unknown as ProgressV2;
    expect(itemsDeletedElsewhere(local, {}, F)).toEqual([]);
  });
});

describe('removeItems', () => {
  it('drops the items without leaving tombstones, and drops series that become empty', () => {
    const p = { s: { a: done(0), b: done(0) }, t: { x: gone(0) } };
    expect(removeItems(p, [{ seriesId: 's', itemId: 'a' }, { seriesId: 't', itemId: 'x' }])).toEqual({ s: { b: done(0) } });
  });
  it('does not change its input', () => {
    const p = { s: { a: done(0) } };
    removeItems(p, [{ seriesId: 's', itemId: 'a' }]);
    expect(p).toEqual({ s: { a: done(0) } });
  });
});

describe('planStaleReview', () => {
  const local: ProgressV2 = {
    s: { old: done(-9000), oldTomb: gone(-9000), edited: done(5000), shared: done(-9000) },
  };
  const server: ProgressV2 = { s: { shared: done(-100), fresh: done(100) }, t: { z: done(100) } };

  it('removes what was deleted elsewhere, keeps real offline edits, merges the rest', () => {
    const plan = planStaleReview(local, server, F);
    expect(keys(plan.remove)).toEqual(['s/old', 's/oldTomb']);
    expect(plan.result).toEqual({ s: { edited: done(5000), shared: done(-100), fresh: done(100) }, t: { z: done(100) } });
    // nothing resurrects: neither removed item is in the result, not even as a tombstone
    expect(plan.result.s.old).toBeUndefined();
    expect(plan.result.s.oldTomb).toBeUndefined();
  });

  it('no server document (404) or no F: removes nothing and merges as usual', () => {
    expect(planStaleReview(local, null, F)).toEqual({ remove: [], result: local });
    const noFloor = planStaleReview(local, server, null);
    expect(noFloor.remove).toEqual([]);
    expect(noFloor.result).toEqual(mergeProgressV2(local, server));
    expect(noFloor.result.s.old).toBeDefined();
  });

  it('does not change its inputs', () => {
    const copy = JSON.stringify([local, server]);
    planStaleReview(local, server, F);
    expect(JSON.stringify([local, server])).toBe(copy);
  });
});
