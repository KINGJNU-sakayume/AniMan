import { describe, expect, it } from 'vitest';
import { backupFileName, backupToV2, createBackup, createBackupV1, parseBackup, previewImport, resolveImport } from './backup';
import { EPOCH_AT, type ProgressV2 } from './model';
import { SERIES_ID } from '../../test/fixtures';

const NOW = new Date('2026-02-03T04:05:06.000Z');
const AT = '2026-02-03T04:05:06.000Z';
const done = (at = AT) => ({ done: true, at });
const gone = (at = AT) => ({ done: false, at });

describe('createBackup', () => {
  it('produces the v2 format, tombstones included', () => {
    const progress: ProgressV2 = { [SERIES_ID]: { 'ep-1': done(), 'ep-2': gone() } };
    expect(createBackup(progress, NOW)).toEqual({ app: 'animan', version: 2, exportedAt: AT, progress });
    expect(backupFileName(NOW)).toBe('animan-backup-2026-02-03.json');
  });

  it('drops tombstones older than 180 days when writing the file, but keeps old done:true', () => {
    const old = '2025-01-01T00:00:00.000Z';
    expect(createBackup({ a: { x: gone(old), y: done(old) } }, NOW).progress).toEqual({ a: { y: done(old) } });
  });

  it('round-trips through parseBackup', () => {
    const backup = createBackup({ a: { '1': done(), '2': gone() }, b: { '3': done() } }, NOW);
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('can still produce the old v1 shape without tombstones (kept for the owner to decide)', () => {
    expect(createBackupV1({ a: { x: done(), y: gone() }, b: { z: gone() } }, NOW)).toEqual({
      app: 'animan', version: 1, exportedAt: AT, progress: { a: ['x'] },
    });
  });
});

describe('parseBackup', () => {
  const v1 = { app: 'animan', version: 1, exportedAt: AT, progress: { a: ['1'] } };
  const v2 = { app: 'animan', version: 2, exportedAt: AT, progress: { a: { '1': done() } } };

  it.each([
    ['not json', '{', /JSON/],
    ['array', '[]', /형식/],
    ['wrong app', JSON.stringify({ ...v2, app: 'other' }), /app/],
    ['wrong version', JSON.stringify({ ...v2, version: 3 }), /버전/],
    ['v2 progress not object', JSON.stringify({ ...v2, progress: [] }), /progress/],
    ['v1 progress not object', JSON.stringify({ ...v1, progress: [] }), /progress/],
    ['v1 ids not array', JSON.stringify({ ...v1, progress: { a: '1' } }), /progress/],
  ])('rejects %s', (_name, text, error) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it('still reads v1 backup files and drops non-string and duplicate ids', () => {
    const result = parseBackup(JSON.stringify({ ...v1, progress: { a: ['1', 2, '1', null] } }));
    expect(result.ok && result.backup).toEqual({ app: 'animan', version: 1, exportedAt: AT, progress: { a: ['1'] } });
  });

  it('drops v2 entries it cannot read', () => {
    const result = parseBackup(JSON.stringify({ ...v2, progress: { a: { '1': done(), bad: { done: true, at: 'x' }, worse: 5 } } }));
    expect(result.ok && result.backup.progress).toEqual({ a: { '1': done() } });
  });
});

describe('backupToV2', () => {
  it('v1 file: every id done:true at the file\'s exportedAt (epoch when it is missing or unreadable)', () => {
    expect(backupToV2({ app: 'animan', version: 1, exportedAt: AT, progress: { a: ['1', '2'] } })).toEqual({ a: { '1': done(), '2': done() } });
    expect(backupToV2({ app: 'animan', version: 1, exportedAt: '', progress: { a: ['1'] } })).toEqual({ a: { '1': done(EPOCH_AT) } });
    expect(backupToV2({ app: 'animan', version: 1, exportedAt: 'nonsense', progress: { a: ['1'] } })).toEqual({ a: { '1': done(EPOCH_AT) } });
  });
});

describe('resolveImport / previewImport', () => {
  const catalog = {
    [SERIES_ID]: { title: '테스트 작품', itemIds: new Set(['ep-1', 'ep-2', 'vol-1']) },
  };
  const later = '2026-03-01T00:00:00.000Z';
  const base = Date.parse(later);
  const current: ProgressV2 = { [SERIES_ID]: { 'ep-1': done() }, keep: { k: done() } };

  it('merge (v1 file): shows additions only and never removes', () => {
    const backup = { app: 'animan' as const, version: 1 as const, exportedAt: AT, progress: { [SERIES_ID]: ['ep-1', 'ep-2', 'ghost'] } };
    const p = previewImport(current, backup, 'merge', catalog, base);
    expect(p.result).toEqual({
      [SERIES_ID]: { 'ep-1': done(), 'ep-2': done(), ghost: done() },
      keep: { k: done() },
    });
    expect(p.rows).toEqual([
      { seriesId: SERIES_ID, title: '테스트 작품', before: 1, after: 3, added: 2, removed: 0, unknownIds: 1 },
    ]);
    expect(p.totalAdded).toBe(2);
    expect(p.totalRemoved).toBe(0);
  });

  it('merge (v2 file): a later tombstone in the file removes the item; a later local mark survives an older tombstone', () => {
    const file = { app: 'animan' as const, version: 2 as const, exportedAt: later, progress: { [SERIES_ID]: { 'ep-1': gone(later) }, keep: { k: gone('2025-01-01T00:00:00.000Z') } } };
    const p = previewImport(current, file, 'merge', catalog, base);
    expect(p.result[SERIES_ID]['ep-1']).toEqual(gone(later));
    expect(p.result.keep.k).toEqual(done());
    expect(p.totalRemoved).toBe(1);
  });

  it('replace: totals show what disappears, and it becomes a tombstone stamped with the import time', () => {
    const backup = { app: 'animan' as const, version: 1 as const, exportedAt: AT, progress: { [SERIES_ID]: ['ep-2'] } };
    const p = previewImport(current, backup, 'replace', catalog, base);
    expect(p.result.keep.k).toEqual(gone(later));
    expect(p.result[SERIES_ID]['ep-1']).toEqual(gone(later));
    expect(p.result[SERIES_ID]['ep-2'].done).toBe(true);
    expect(p.totalAdded).toBe(1);
    expect(p.totalRemoved).toBe(2);
    expect(p.rows.map((r) => r.seriesId).sort()).toEqual(['keep', SERIES_ID].sort());
    expect(p.rows.find((r) => r.seriesId === 'keep')).toMatchObject({ title: null, before: 1, after: 0, removed: 1 });
  });

  it('does not change the current state, and unknown series count all their ids as unknown', () => {
    const snapshot = JSON.stringify(current);
    const backup = { app: 'animan' as const, version: 1 as const, exportedAt: AT, progress: { elsewhere: ['a', 'b'] } };
    const p = previewImport(current, backup, 'merge', catalog, base);
    expect(JSON.stringify(current)).toBe(snapshot);
    expect(p.rows).toEqual([{ seriesId: 'elsewhere', title: null, before: 0, after: 2, added: 2, removed: 0, unknownIds: 2 }]);
  });

  it('resolveImport is what the store applies (same function for preview and apply)', () => {
    const backup = { app: 'animan' as const, version: 1 as const, exportedAt: AT, progress: { keep: ['k', 'z'] } };
    expect(resolveImport(current, backup, 'merge', base)).toEqual(previewImport(current, backup, 'merge', catalog, base).result);
  });
});
