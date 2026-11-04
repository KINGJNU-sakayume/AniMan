import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_ID, syntheticSeries } from '../../test/fixtures';
import { EPOCH_AT, type ProgressV2 } from './model';

const V1_KEY = 'animan:progress:v1';
const V2_KEY = 'animan:progress:v2';
const DRAFTS_KEY = 'animan:drafts:v1';
const FLOOR_KEY = 'animan:progress:clock-floor:v1';

const NOW = Date.UTC(2026, 10, 3, 9, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

/** localStorage 상태를 정한 뒤 모듈을 새로 불러온다 (모듈이 로드 시점에 저장소를 읽으므로). */
const loadStore = async (setup: { v1?: unknown; v2?: unknown; raw2?: string } = {}) => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem(DRAFTS_KEY, JSON.stringify([syntheticSeries()]));
  if (setup.v1 !== undefined) localStorage.setItem(V1_KEY, JSON.stringify(setup.v1));
  if (setup.v2 !== undefined) localStorage.setItem(V2_KEY, JSON.stringify({ app: 'animan', version: 2, exportedAt: iso(NOW), progress: setup.v2 }));
  if (setup.raw2 !== undefined) localStorage.setItem(V2_KEY, setup.raw2);
  return import('./store');
};

const storedV2 = (): ProgressV2 => JSON.parse(localStorage.getItem(V2_KEY) ?? '{"progress":{}}').progress;
const entry = (done: boolean, ms: number) => ({ done, at: iso(ms) });

describe('progress store (v2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('starts empty and persists a stamped v2 document, leaving no v1 key behind', async () => {
    const s = await loadStore();
    expect(s.getProgress()).toEqual({});
    expect(s.markCompleted(SERIES_ID, ['ep-1', 'ep-2', 'ep-1'])).toEqual(['ep-1', 'ep-2']);
    const doc = JSON.parse(localStorage.getItem(V2_KEY)!);
    expect(doc).toMatchObject({ app: 'animan', version: 2 });
    expect(doc.progress[SERIES_ID]['ep-1']).toEqual(entry(true, NOW));
    expect(s.getProgress()).toEqual({ [SERIES_ID]: ['ep-1', 'ep-2'] });
    expect(localStorage.getItem(V1_KEY)).toBeNull();
    // 이미 완료된 항목은 다시 추가되지 않고 시각도 그대로
    vi.setSystemTime(NOW + 5000);
    expect(s.markCompleted(SERIES_ID, ['ep-2'])).toEqual([]);
    expect(storedV2()[SERIES_ID]['ep-2']).toEqual(entry(true, NOW));
  });

  describe('v1 → v2 migration', () => {
    it('converts once when the v2 key is missing: done:true at the fixed early time', async () => {
      const s = await loadStore({ v1: { [SERIES_ID]: ['ep-1', 'vol-2'], other: ['x'] } });
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1', 'vol-2']);
      expect(s.getProgressV2()[SERIES_ID]['ep-1']).toEqual({ done: true, at: EPOCH_AT });
      expect(storedV2().other.x).toEqual({ done: true, at: EPOCH_AT });
    });

    it('leaves the v1 value untouched (rollback copy), also after later changes', async () => {
      const original = JSON.stringify({ [SERIES_ID]: ['ep-1'], k: ['z'] });
      vi.resetModules();
      localStorage.clear();
      localStorage.setItem(V1_KEY, original);
      const s = await import('./store');
      expect(localStorage.getItem(V1_KEY)).toBe(original);
      s.toggleCompleted(SERIES_ID, 'ep-1');
      s.markCompleted(SERIES_ID, ['ep-2']);
      s.importProgress({ fresh: ['f'] }, 'replace');
      expect(localStorage.getItem(V1_KEY)).toBe(original);
    });

    it('does not convert again when the v2 key exists, even if v1 changed (e.g. an old build wrote to it)', async () => {
      const s = await loadStore({ v1: { [SERIES_ID]: ['ep-1'] }, v2: { [SERIES_ID]: { 'ep-2': entry(true, NOW) } } });
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2']);
      localStorage.setItem(V1_KEY, JSON.stringify({ [SERIES_ID]: ['vol-1'] }));
      s.reloadProgress();
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2']);
    });

    it('writes nothing when there is no v1 data, so v1 data that appears later is still picked up once', async () => {
      const s = await loadStore();
      expect(localStorage.getItem(V2_KEY)).toBeNull();
      localStorage.setItem(V1_KEY, JSON.stringify({ a: ['1'] }));
      s.reloadProgress();
      expect(s.getCompletedIds('a')).toEqual(['1']);
    });

    it('a real un-mark on another device wins over converted v1 data', async () => {
      const s = await loadStore({ v1: { a: ['1'] } });
      const { mergeProgressV2 } = await import('./merge');
      const other = { a: { '1': entry(false, NOW - 86_400_000) } };
      expect(mergeProgressV2(s.getProgressV2(), other).a['1'].done).toBe(false);
    });
  });

  describe('every write path leaves stamped v2 entries', () => {
    it('unmarkCompleted leaves a tombstone (done:false) and drops the id from the derived list', async () => {
      const s = await loadStore({ v1: { [SERIES_ID]: ['ep-1', 'ep-2'] } });
      vi.setSystemTime(NOW + 1000);
      expect(s.unmarkCompleted(SERIES_ID, ['ep-1', 'nope'])).toEqual(['ep-1']);
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2']);
      expect(storedV2()[SERIES_ID]['ep-1']).toEqual(entry(false, NOW + 1000));
      expect(storedV2()[SERIES_ID].nope).toBeUndefined();
      s.unmarkCompleted(SERIES_ID, ['ep-2']);
      expect(s.getProgress()).toEqual({});
      expect(storedV2()[SERIES_ID]['ep-2'].done).toBe(false);
    });

    it('toggleCompleted flips state, stamps each flip and notifies subscribers', async () => {
      const s = await loadStore();
      const listener = vi.fn();
      const unsubscribe = s.subscribe(listener);
      expect(s.toggleCompleted(SERIES_ID, 'vol-1')).toBe(true);
      expect(s.isCompleted(SERIES_ID, 'vol-1')).toBe(true);
      expect(s.toggleCompleted(SERIES_ID, 'vol-1')).toBe(false);
      expect(s.isCompleted(SERIES_ID, 'vol-1')).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
      s.toggleCompleted(SERIES_ID, 'vol-1');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('markUpTo marks everything up to the item in chapter order', async () => {
      const s = await loadStore();
      expect(s.markUpTo(SERIES_ID, 'episode', 2)).toEqual(['ep-1', 'ep-2']);
      expect(s.markUpTo(SERIES_ID, 'episode', 'OVA')).toEqual(['ep-3', 'ep-ova']);
      expect(s.markUpTo(SERIES_ID, 'volume', 1)).toEqual(['vol-1']);
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1', 'ep-2', 'ep-3', 'ep-ova', 'vol-1']);
      const stored = storedV2()[SERIES_ID];
      expect(Object.values(stored).every((e) => e.done)).toBe(true);
      // 한 번의 조작은 같은 시각, 다음 조작은 더 늦은 시각을 찍는다(같은 ms 안이어도)
      expect(stored['ep-1'].at).toBe(stored['ep-2'].at);
      expect(Date.parse(stored['ep-3'].at)).toBeGreaterThan(Date.parse(stored['ep-2'].at));
      expect(Date.parse(stored['vol-1'].at)).toBeGreaterThan(Date.parse(stored['ep-3'].at));
    });

    it('markUpTo throws for unknown series or number', async () => {
      const s = await loadStore();
      expect(() => s.markUpTo('missing', 'episode', 1)).toThrow(/알 수 없는 시리즈/);
      expect(() => s.markUpTo(SERIES_ID, 'volume', 99)).toThrow(/찾을 수 없습니다/);
      expect(s.getProgress()).toEqual({});
    });

    it('marking an un-marked item again brings it back (a Life Hub approval uses markCompleted)', async () => {
      const s = await loadStore();
      s.markCompleted(SERIES_ID, ['ep-1']);
      vi.setSystemTime(NOW + 1000);
      s.unmarkCompleted(SERIES_ID, ['ep-1']);
      vi.setSystemTime(NOW + 2000);
      expect(s.markCompleted(SERIES_ID, ['ep-1'])).toEqual(['ep-1']);
      expect(storedV2()[SERIES_ID]['ep-1']).toEqual(entry(true, NOW + 2000));
    });

    it('importProgress merge keeps existing marks and adds new ones; replace tombstones what disappears', async () => {
      const s = await loadStore({ v1: { [SERIES_ID]: ['ep-1'], keep: ['k'] } });
      s.importProgress({ [SERIES_ID]: ['ep-2', 'ep-1'], extra: ['e'] });
      expect(s.getProgress()).toEqual({ [SERIES_ID]: ['ep-1', 'ep-2'], keep: ['k'], extra: ['e'] });
      vi.setSystemTime(NOW + 1000);
      s.importProgress({ only: ['o'] }, 'replace');
      expect(s.getProgress()).toEqual({ only: ['o'] });
      // 사라진 항목은 묘비가 되어 다음 동기화에서 되살아나지 않는다
      expect(storedV2()[SERIES_ID]['ep-1']).toEqual(entry(false, NOW + 1000));
      expect(storedV2().keep.k).toEqual(entry(false, NOW + 1000));
      expect(storedV2().only.o).toEqual(entry(true, NOW + 1000));
    });

    it('importBackup: a v2 file merges per item (its tombstones count), a v1 file enters at its exportedAt', async () => {
      const s = await loadStore();
      s.markCompleted(SERIES_ID, ['ep-1', 'ep-2']);
      s.importBackup({ app: 'animan', version: 2, exportedAt: iso(NOW + 5000), progress: { [SERIES_ID]: { 'ep-1': entry(false, NOW + 5000) } } });
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2']);
      // 로컬 해제(묘비)보다 이른 v1 파일은 되살리지 못한다
      s.importBackup({ app: 'animan', version: 1, exportedAt: iso(NOW - 1000), progress: { [SERIES_ID]: ['ep-1', 'ep-3'] } });
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2', 'ep-3']);
      expect(storedV2()[SERIES_ID]['ep-3']).toEqual(entry(true, NOW - 1000));
      // 덮어쓰기는 파일과 같은 완료 집합이 된다
      s.importBackup({ app: 'animan', version: 1, exportedAt: iso(NOW - 1000), progress: { [SERIES_ID]: ['ep-1'] } }, 'replace');
      expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1']);
      expect(storedV2()[SERIES_ID]['ep-2'].done).toBe(false);
    });
  });

  describe('timestamps', () => {
    it('never go backwards on one device, and a check followed by an un-check in the same millisecond still ends un-checked', async () => {
      const s = await loadStore();
      s.markCompleted(SERIES_ID, ['ep-1']);
      s.unmarkCompleted(SERIES_ID, ['ep-1']); // same Date.now()
      expect(s.isCompleted(SERIES_ID, 'ep-1')).toBe(false);
      const a = Date.parse(storedV2()[SERIES_ID]['ep-1'].at);
      s.markCompleted(SERIES_ID, ['ep-1']);
      s.unmarkCompleted(SERIES_ID, ['ep-1']);
      expect(Date.parse(storedV2()[SERIES_ID]['ep-1'].at)).toBeGreaterThan(a);
      vi.setSystemTime(NOW - 60_000); // a clock that jumped back
      s.markCompleted(SERIES_ID, ['ep-2']);
      s.markCompleted(SERIES_ID, ['ep-3']);
      expect(Date.parse(storedV2()[SERIES_ID]['ep-3'].at)).toBeGreaterThan(Date.parse(storedV2()[SERIES_ID]['ep-2'].at));
      expect(Date.parse(storedV2()[SERIES_ID]['ep-2'].at)).toBeGreaterThanOrEqual(NOW);
    });

    it('use max(now, last seen server written_at + 1ms)', async () => {
      const s = await loadStore();
      const { raiseClockFloor } = await import('./clock');
      raiseClockFloor(iso(NOW + 30_000));
      expect(Number(localStorage.getItem(FLOOR_KEY))).toBe(NOW + 30_000);
      s.markCompleted(SERIES_ID, ['ep-1']);
      expect(storedV2()[SERIES_ID]['ep-1'].at).toBe(iso(NOW + 30_001));
      raiseClockFloor(iso(NOW)); // a smaller value never lowers it
      expect(Number(localStorage.getItem(FLOOR_KEY))).toBe(NOW + 30_000);
    });

    it('an un-mark made on a device with a slow clock still beats the entry it replaces', async () => {
      const s = await loadStore({ v2: { [SERIES_ID]: { 'ep-1': entry(true, NOW + 3_600_000) } } });
      s.unmarkCompleted(SERIES_ID, ['ep-1']);
      expect(storedV2()[SERIES_ID]['ep-1']).toEqual(entry(false, NOW + 3_600_001));
    });
  });

  describe('tombstone pruning happens only when writing', () => {
    const day = 86_400_000;
    const stale = { [SERIES_ID]: { 'ep-1': entry(false, NOW - 181 * day), 'ep-2': entry(false, NOW - 10 * day), 'ep-3': entry(true, NOW - 400 * day) } };

    it('loading and reading keep an old tombstone; the next local write drops it', async () => {
      const s = await loadStore({ v2: stale });
      expect(s.getProgressV2()[SERIES_ID]['ep-1']).toBeDefined();
      s.markCompleted(SERIES_ID, ['vol-1']);
      expect(storedV2()[SERIES_ID]['ep-1']).toBeUndefined();
      expect(storedV2()[SERIES_ID]['ep-2']).toBeDefined();
      expect(storedV2()[SERIES_ID]['ep-3']).toBeDefined(); // done:true entries are never pruned
    });

    it('applyRemote merges first and prunes after, so a remote tombstone still wins over an older local mark', async () => {
      const s = await loadStore({ v2: { a: { x: entry(true, NOW - 500 * day) } } });
      s.applyRemote({ a: { x: entry(false, NOW - 190 * day) } });
      expect(s.isCompleted('a', 'x')).toBe(false);
    });
  });

  describe('applyRemote', () => {
    it('writes local ∪ remote, keeps local-only items, and does nothing when nothing changed', async () => {
      const s = await loadStore({ v2: { a: { local: entry(true, NOW), both: entry(true, NOW) } } });
      const listener = vi.fn();
      s.subscribe(listener);
      const result = s.applyRemote({ a: { both: entry(false, NOW + 1000), remote: entry(true, NOW) } });
      expect(result.a).toEqual({ local: entry(true, NOW), both: entry(false, NOW + 1000), remote: entry(true, NOW) });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(storedV2()).toEqual(result);
      s.applyRemote({ a: { both: entry(false, NOW + 1000) } });
      s.applyRemote('garbage');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(s.getProgress()).toEqual({ a: ['local', 'remote'] });
    });

    it('keeps the derived list reference when only tombstones changed', async () => {
      const s = await loadStore({ v2: { a: { x: entry(true, NOW) } } });
      const before = s.getProgress();
      s.applyRemote({ a: { gone: entry(false, NOW) } });
      expect(s.getProgress()).toBe(before);
    });
  });

  describe('applyStaleReview', () => {
    const F = NOW - 1000;
    const local = { a: { gone1: entry(true, F - 5000), tomb: entry(false, F - 5000), edit: entry(true, F + 10) } };

    it('removes the confirmed items without tombstones, merges the server in, in one write', async () => {
      const s = await loadStore({ v2: local });
      const listener = vi.fn();
      s.subscribe(listener);
      s.applyStaleReview(
        [{ seriesId: 'a', itemId: 'gone1', done: true, at: iso(F - 5000) }, { seriesId: 'a', itemId: 'tomb', done: false, at: iso(F - 5000) }],
        { a: { fresh: entry(true, F + 5) } },
        F
      );
      expect(storedV2()).toEqual({ a: { edit: entry(true, F + 10), fresh: entry(true, F + 5) } });
      expect(s.getCompletedIds('a')).toEqual(['edit', 'fresh']);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('only removes items that are still unchanged and missing: a change made after the preview is kept', async () => {
      const s = await loadStore({ v2: local });
      const confirmed = [{ seriesId: 'a', itemId: 'gone1', done: true, at: iso(F - 5000) }, { seriesId: 'a', itemId: 'edit', done: true, at: iso(F + 10) }];
      s.applyStaleReview(confirmed, { a: {} }, F); // `edit` is newer than F, `gone1` is the confirmed one
      expect(storedV2().a.edit).toBeDefined();
      expect(storedV2().a.gone1).toBeUndefined();
      // an item that is on the server after all is not removed either
      const t = await loadStore({ v2: local });
      t.applyStaleReview([{ seriesId: 'a', itemId: 'gone1', done: true, at: iso(F - 5000) }], { a: { gone1: entry(false, F + 1) } }, F);
      expect(storedV2().a.gone1).toEqual(entry(false, F + 1)); // the server's tombstone wins by the normal merge
    });

    it('no server document or no F: nothing is removed', async () => {
      const s = await loadStore({ v2: local });
      const confirmed = [{ seriesId: 'a', itemId: 'gone1', done: true, at: iso(F - 5000) }];
      s.applyStaleReview(confirmed, null, F);
      s.applyStaleReview(confirmed, { b: { z: entry(true, F) } }, null);
      expect(storedV2().a.gone1).toBeDefined();
    });
  });

  it('recovers from corrupted or malformed storage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let s = await loadStore({ raw2: '{not json' });
    expect(s.getProgress()).toEqual({});
    s.markCompleted(SERIES_ID, ['ep-1']);
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1']);

    s = await loadStore({ raw2: JSON.stringify({ app: 'other', version: 2, progress: {} }) });
    expect(s.getProgress()).toEqual({});
    s = await loadStore({ v1: { [SERIES_ID]: 'oops' } });
    expect(s.getProgress()).toEqual({});
    s = await loadStore({ v1: { [SERIES_ID]: ['ep-1', 5, null, 'ep-1', ''] } });
    expect(s.getProgress()).toEqual({ [SERIES_ID]: ['ep-1'] });
    warn.mockRestore();
  });

  it('keeps working in memory when localStorage writes fail', async () => {
    const s = await loadStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    s.markCompleted(SERIES_ID, ['ep-1']);
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1']);
    spy.mockRestore();
    err.mockRestore();
  });

  it('reloads when another tab changes storage', async () => {
    const s = await loadStore();
    const listener = vi.fn();
    s.subscribe(listener);
    localStorage.setItem(V2_KEY, JSON.stringify({ app: 'animan', version: 2, exportedAt: iso(NOW), progress: { [SERIES_ID]: { 'vol-2': entry(true, NOW) } } }));
    window.dispatchEvent(new StorageEvent('storage', { key: V2_KEY }));
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['vol-2']);
    expect(listener).toHaveBeenCalled();
  });
});
