import { describe, expect, it } from 'vitest';
import { buildSeriesRecord, recordToAdminInput } from './seriesBuilder';
import { syntheticSeries } from '../test/fixtures';

const form = { title: ' 새 작품 ', description: '', accentColor: '#123456', coverUrl: '', bannerUrl: '', youtubeBgmId: '' };

describe('seriesBuilder', () => {
  it('assigns new ids and normalizes fields', () => {
    let n = 0;
    const record = buildSeriesRecord(
      form,
      { episodes: [{ number: 1, startChapter: 1, endChapter: 3 }], volumes: [{ number: 1, startChapter: 1, endChapter: 9 }] },
      { makeId: () => `id-${++n}`, now: new Date('2026-01-01T00:00:00Z') }
    );
    expect(record).toMatchObject({
      id: 'id-1',
      title: '새 작품',
      description: null,
      accent_color: '#123456',
      created_at: '2026-01-01T00:00:00.000Z',
      episodes: [{ id: 'id-2', episode_number: '1', start_chapter: 1, end_chapter: 3 }],
      volumes: [{ id: 'id-3', volume_number: 1 }],
    });
  });

  it('keeps the TMDB entry of the series being edited (the form has no such fields)', () => {
    const original = syntheticSeries({ tmdb_id: 7, tmdb_media_type: 'tv', tmdb_poster_path: '/abc_DEF-1.jpg' });
    const { form: f, json } = recordToAdminInput(original);
    const rebuilt = buildSeriesRecord(f, json, { id: original.id, createdAt: original.created_at, tmdb: original });
    expect(rebuilt).toMatchObject({ tmdb_id: 7, tmdb_media_type: 'tv', tmdb_poster_path: '/abc_DEF-1.jpg' });
    expect(buildSeriesRecord(f, json, { id: original.id })).not.toHaveProperty('tmdb_id');
  });

  it('round-trips an existing record keeping every id', () => {
    const original = syntheticSeries();
    const { form: f, json } = recordToAdminInput(original);
    const rebuilt = buildSeriesRecord(f, json, {
      id: original.id,
      createdAt: original.created_at,
      makeId: () => {
        throw new Error('should not create ids');
      },
    });
    expect(rebuilt).toEqual(original);
  });

  it('rejects missing title, bad numbers and duplicates', () => {
    expect(() => buildSeriesRecord({ ...form, title: ' ' }, {})).toThrow(/제목/);
    expect(() =>
      buildSeriesRecord(form, { volumes: [{ number: 1, startChapter: 'x' as unknown as number, endChapter: 2 }] })
    ).toThrow(/숫자/);
    expect(() =>
      buildSeriesRecord(form, {
        volumes: [
          { number: 1, startChapter: 1, endChapter: 2 },
          { number: 1, startChapter: 3, endChapter: 4 },
        ],
      })
    ).toThrow(/중복된 권/);
  });
});
