import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_ID, syntheticSeries } from '../../test/fixtures';

const PROGRESS_KEY = 'animan:progress:v1';
const DRAFTS_KEY = 'animan:drafts:v1';

/** localStorage 상태를 정한 뒤 모듈을 새로 불러온다 (모듈이 로드 시점에 저장소를 읽으므로). */
const loadStore = async (progress?: unknown, raw?: string) => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem(DRAFTS_KEY, JSON.stringify([syntheticSeries()]));
  if (raw !== undefined) localStorage.setItem(PROGRESS_KEY, raw);
  else if (progress !== undefined) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  return import('./store');
};

const stored = () => JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');

describe('progress store', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty and persists markCompleted to localStorage', async () => {
    const s = await loadStore();
    expect(s.getProgress()).toEqual({});
    expect(s.markCompleted(SERIES_ID, ['ep-1', 'ep-2', 'ep-1'])).toEqual(['ep-1', 'ep-2']);
    expect(stored()).toEqual({ [SERIES_ID]: ['ep-1', 'ep-2'] });
    // 이미 완료된 항목은 다시 추가되지 않음
    expect(s.markCompleted(SERIES_ID, ['ep-2'])).toEqual([]);
  });

  it('loads existing progress and keeps legacy IDs as-is', async () => {
    const s = await loadStore({ [SERIES_ID]: ['ep-1', 'vol-2'], other: ['x'] });
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-1', 'vol-2']);
    expect(s.getCompletedIds('other')).toEqual(['x']);
  });

  it('unmarkCompleted removes ids and drops empty series', async () => {
    const s = await loadStore({ [SERIES_ID]: ['ep-1', 'ep-2'] });
    expect(s.unmarkCompleted(SERIES_ID, ['ep-1', 'nope'])).toEqual(['ep-1']);
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['ep-2']);
    s.unmarkCompleted(SERIES_ID, ['ep-2']);
    expect(stored()).toEqual({});
  });

  it('toggleCompleted flips state and notifies subscribers', async () => {
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
  });

  it('markUpTo throws for unknown series or number', async () => {
    const s = await loadStore();
    expect(() => s.markUpTo('missing', 'episode', 1)).toThrow(/알 수 없는 시리즈/);
    expect(() => s.markUpTo(SERIES_ID, 'volume', 99)).toThrow(/찾을 수 없습니다/);
    expect(s.getProgress()).toEqual({});
  });

  it('recovers from corrupted or malformed storage', async () => {
    let s = await loadStore(undefined, '{not json');
    expect(s.getProgress()).toEqual({});
    s.markCompleted(SERIES_ID, ['ep-1']);
    expect(stored()).toEqual({ [SERIES_ID]: ['ep-1'] });

    s = await loadStore({ [SERIES_ID]: 'oops' });
    expect(s.getProgress()).toEqual({});

    s = await loadStore({ [SERIES_ID]: ['ep-1', 5, null, 'ep-1', ''] });
    expect(s.getProgress()).toEqual({ [SERIES_ID]: ['ep-1'] });
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

  it('importProgress merges (union) by default and can replace', async () => {
    const s = await loadStore({ [SERIES_ID]: ['ep-1'], keep: ['k'] });
    s.importProgress({ [SERIES_ID]: ['ep-2', 'ep-1'], extra: ['e'] });
    expect(s.getProgress()).toEqual({ [SERIES_ID]: ['ep-1', 'ep-2'], keep: ['k'], extra: ['e'] });
    s.importProgress({ only: ['o'] }, 'replace');
    expect(s.getProgress()).toEqual({ only: ['o'] });
    expect(stored()).toEqual({ only: ['o'] });
  });

  it('reloads when another tab changes storage', async () => {
    const s = await loadStore();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ [SERIES_ID]: ['vol-2'] }));
    window.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_KEY }));
    expect(s.getCompletedIds(SERIES_ID)).toEqual(['vol-2']);
  });
});
