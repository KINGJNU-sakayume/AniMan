import { describe, expect, it } from 'vitest';
import { backupFileName, createBackup, parseBackup, previewImport } from './backup';
import { SERIES_ID } from '../../test/fixtures';

const NOW = new Date('2026-02-03T04:05:06.000Z');

describe('createBackup', () => {
  it('produces the versioned format', () => {
    expect(createBackup({ [SERIES_ID]: ['ep-1', 'ep-1'] }, NOW)).toEqual({
      app: 'animan',
      version: 1,
      exportedAt: '2026-02-03T04:05:06.000Z',
      progress: { [SERIES_ID]: ['ep-1'] },
    });
    expect(backupFileName(NOW)).toBe('animan-backup-2026-02-03.json');
  });

  it('round-trips through parseBackup', () => {
    const backup = createBackup({ a: ['1', '2'], b: ['3'] }, NOW);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual({ ok: true, backup });
  });
});

describe('parseBackup', () => {
  const valid = { app: 'animan', version: 1, exportedAt: NOW.toISOString(), progress: { a: ['1'] } };

  it.each([
    ['not json', '{', /JSON/],
    ['array', '[]', /형식/],
    ['wrong app', JSON.stringify({ ...valid, app: 'other' }), /app/],
    ['wrong version', JSON.stringify({ ...valid, version: 2 }), /버전/],
    ['progress not object', JSON.stringify({ ...valid, progress: [] }), /progress/],
    ['ids not array', JSON.stringify({ ...valid, progress: { a: '1' } }), /progress/],
  ])('rejects %s', (_name, text, error) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it('drops non-string and duplicate ids', () => {
    const result = parseBackup(JSON.stringify({ ...valid, progress: { a: ['1', 2, '1', null] } }));
    expect(result.ok && result.backup.progress).toEqual({ a: ['1'] });
  });
});

describe('previewImport', () => {
  const catalog = {
    [SERIES_ID]: { title: '테스트 작품', itemIds: new Set(['ep-1', 'ep-2', 'vol-1']) },
  };

  it('merge: shows additions only and never removes', () => {
    const current = { [SERIES_ID]: ['ep-1'], keep: ['k'] };
    const p = previewImport(current, { [SERIES_ID]: ['ep-1', 'ep-2', 'ghost'] }, 'merge', catalog);
    expect(p.result).toEqual({ [SERIES_ID]: ['ep-1', 'ep-2', 'ghost'], keep: ['k'] });
    expect(p.rows).toEqual([
      { seriesId: SERIES_ID, title: '테스트 작품', before: 1, after: 3, added: 2, removed: 0, unknownIds: 1 },
    ]);
    expect(p.totalAdded).toBe(2);
    expect(p.totalRemoved).toBe(0);
  });

  it('replace: reports removals and unknown series', () => {
    const current = { [SERIES_ID]: ['ep-1', 'vol-1'] };
    const p = previewImport(current, { [SERIES_ID]: ['ep-2'], unknown: ['x'] }, 'replace', catalog);
    expect(p.result).toEqual({ [SERIES_ID]: ['ep-2'], unknown: ['x'] });
    expect(p.totalAdded).toBe(2);
    expect(p.totalRemoved).toBe(2);
    expect(p.rows.find((r) => r.seriesId === 'unknown')).toMatchObject({ title: null, unknownIds: 1 });
  });

  it('does not mutate the current map', () => {
    const current = { [SERIES_ID]: ['ep-1'] };
    previewImport(current, { [SERIES_ID]: ['ep-2'] }, 'merge');
    expect(current).toEqual({ [SERIES_ID]: ['ep-1'] });
  });
});
