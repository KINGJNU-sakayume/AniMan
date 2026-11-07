import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../test/boardSchema';
import { BOARD_POLICY } from '../../test/boardPolicy';
import type { SeriesRecord } from '../../types';
import { EPOCH_AT, type ProgressV2 } from '../progress/model';
import { buildBoardTiles, clip, dateLabel, firstChar, hexToAccent, hasAnyRecord, posterUrl, type BoardManifest } from './tiles';
import { SAMPLE_NOW, sampleCatalog, sampleProgress, sampleSeries } from './sampleState';

// 합성 데이터만. 규격 검사는 board 의 js/schema.js 복사본(src/test/boardSchema.js)을 정책과 함께 쓴다.
const SAMPLE_PATH = resolve(process.cwd(), 'board/sample.json'); // 저장소 루트에서 실행한다(npm test)
const build = (progress = sampleProgress, catalog = sampleCatalog, now = SAMPLE_NOW) => buildBoardTiles(progress, catalog, now);
const plain = (m: BoardManifest) => JSON.parse(JSON.stringify(m)) as BoardManifest;

/** 규격 v1 검사: errors 가 비어 있고 남은 타일 수가 입력과 같아야 한다(ok 만 보면 틀린 타일도 통과한다). */
function expectValid(m: BoardManifest) {
  const v = validateManifest(plain(m), BOARD_POLICY);
  expect(v.errors).toEqual([]);
  expect(v.tiles).toHaveLength(m.tiles.length);
  return v;
}

const walk = (value: unknown, fn: (v: unknown, path: string) => void, path = '$') => {
  fn(value, path);
  if (Array.isArray(value)) value.forEach((x, i) => walk(x, fn, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, x] of Object.entries(value)) walk(x, fn, `${path}.${k}`);
};

describe('sample output', () => {
  it('passes schema v1 with the policy: no errors, every tile kept', () => {
    const v = expectValid(build());
    expect(v.tiles.map((t) => t.id)).toEqual(['now', 'done', 'next']);
    expect(v.app).toBe('animan');
  });

  it('board/sample.json is what the function builds (UPDATE_BOARD_SAMPLE=1 rewrites it)', () => {
    const text = JSON.stringify(build(), null, 2) + '\n';
    if (process.env.UPDATE_BOARD_SAMPLE === '1') writeFileSync(SAMPLE_PATH, text);
    expect(readFileSync(SAMPLE_PATH, 'utf8')).toBe(text);
  });
});

describe('tiles', () => {
  it('fixes ids, sizes, first size and default', () => {
    const tiles = Object.fromEntries(build().tiles.map((t) => [t.id, t]));
    expect(tiles.now).toMatchObject({ tone: 'sleeve', sizes: ['1x1', '2x1', '2x2', '4x2'], size: '2x2', default: true });
    expect(tiles.done).toMatchObject({ tone: 'strip', sizes: ['2x1', '4x1'], size: '4x1', default: true });
    expect(tiles.next).toMatchObject({ tone: 'type', form: 'list', sizes: ['2x1', '2x2'], size: '2x2', default: false });
    for (const t of Object.values(tiles)) expect(t.href).toBe('https://kingjnu-sakayume.github.io/animan/');
  });

  it('now: most recently watched series with season/episode, progress, dated pill, accent, poster', () => {
    const m = build();
    const now = m.tiles[0];
    expect(now.data).toMatchObject({
      label: 'AniMan', title: '가상 모험담', pill: '11/6 이어 봄',
      progress: { value: 8, max: 12, text: '8 / 12화' },
      cover: { src: 'https://image.tmdb.org/t/p/w780/sample-poster-a.jpg', alt: '' },
    });
    // 마지막으로 체크한 화: 8화(시즌 2).
    expect((now.data as { sub: string }).sub).toBe('시즌 2 · 8화 · 가상 에피소드 8');
    expect(now.accent).toEqual(hexToAccent('#166FBB'));
  });

  it('now: list (back) and detail use the same recent series with different counts', () => {
    const now = build().tiles[0];
    const list = (now.data as { list: Array<{ title: string; now?: boolean; muted?: boolean }> }).list;
    expect(list.map((r) => r.title)).toEqual(['가상 모험담', '가상 우주 여행', '가상 학원 코미디', '가상 요리 일지']);
    expect(list[0].now).toBe(true);
    expect(list[2].muted).toBe(true);
    expect(now.detail!.rows.map((r) => r.title)).toEqual(['가상 모험담', '가상 우주 여행', '가상 학원 코미디', '가상 요리 일지']);
    expect(now.detail!.title).toBe('AniMan · 최근 정주행 4개');
  });

  it('done: finished series only, newest first, with thumbnails where a poster exists', () => {
    const done = build().tiles[1].data as { items: Array<{ title: string; cover?: { src: string } }> };
    expect(done.items.map((i) => i.title)).toEqual(['가상 학원 코미디', '가상 요리 일지']);
    expect(done.items[0].cover?.src).toBe('https://image.tmdb.org/t/p/w342/sample-poster-b.jpg');
  });

  it('next: in-progress series by last watched, with the first episode not yet done (not highest done + 1)', () => {
    const catalog = [sampleSeries('x', '가상 하나', 6, '#112233', null)];
    // 1,2,4 를 봤다 → 다음은 3화. 에피소드 순서를 섞어 둬도 챕터 순서를 따른다.
    catalog[0].episodes.reverse();
    const progress: ProgressV2 = { x: Object.fromEntries(['x-e1', 'x-e2', 'x-e4'].map((id, i) => [id, { done: true, at: `2026-11-05T0${i}:00:00.000Z` }])) };
    const next = build(progress, catalog).tiles.find((t) => t.id === 'next')!;
    expect((next.data as { rows: Array<{ value: string }> }).rows[0].value).toBe('3화');
    expect((next.data as { foot: string }).foot).toBe('마지막 시청 11/5');
  });

  it('series with a missing poster gets a letter cell on sleeve and no cover on strip/rows', () => {
    const catalog = [sampleSeries('p', '가상 포스터 없음', 2, '#ff0000', null)];
    const progress: ProgressV2 = { p: { 'p-e1': { done: true, at: '2026-11-05T10:00:00.000Z' }, 'p-e2': { done: true, at: '2026-11-05T11:00:00.000Z' } } };
    const m = build(progress, catalog);
    expect(m.tiles[0].data.cover).toEqual({ mono: '가' });
    expect((m.tiles[1].data as { items: Array<Record<string, unknown>> }).items[0]).toEqual({ title: '가상 포스터 없음' });
    expectValid(m);
    // 이상한 포스터 경로도 글자 칸으로 대신한다
    const odd = [{ ...catalog[0], tmdb_poster_path: 'https://evil.example/x.jpg' }];
    expect(build(progress, odd).tiles[0].data.cover).toEqual({ mono: '가' });
    expect(posterUrl({ tmdb_poster_path: '/../x.jpg' }, 'w780')).toBeUndefined();
  });
});

describe('text rules', () => {
  const long = '가'.repeat(200);
  const make = () => {
    const catalog: SeriesRecord[] = Array.from({ length: 12 }, (_, i) => {
      const s = sampleSeries(`l${i}`, `${long}${i}`, 3, '#abcdef', '/long-poster.jpg');
      s.episodes[0].title = long;
      s.episodes[0].episode_number = '가'.repeat(100);
      return s;
    });
    const progress: ProgressV2 = Object.fromEntries(
      catalog.map((s, i) => [s.id, Object.fromEntries(s.episodes.slice(0, i % 2 ? 3 : 1).map((e) => [e.id, { done: true, at: `2026-11-0${(i % 6) + 1}T10:00:00.000Z` }]))])
    );
    return { catalog, progress };
  };

  it('cuts long text to the schema limits and stays valid', () => {
    const { catalog, progress } = make();
    const m = build(progress, catalog);
    expectValid(m);
    const now = m.tiles[0];
    const data = now.data as { title: string; pill: string; sub: string };
    expect(data.title.length).toBeLessThanOrEqual(80);
    expect(data.title.endsWith('…')).toBe(true);
    expect(data.pill.length).toBeLessThanOrEqual(20);
    expect(data.sub.length).toBeLessThanOrEqual(160);
    expect(now.name.length).toBeLessThanOrEqual(30);
    expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThan(64 * 1024);
  });

  it('never sends an empty or blank string (whole tile would be rejected)', () => {
    const catalog = [sampleSeries('b', '  가상 공백  ', 3, 'not-a-color', '/p.jpg')];
    catalog[0].episodes[0].title = '   ';
    catalog[0].episodes[0].episode_number = ' ';
    const progress: ProgressV2 = { b: { 'b-e1': { done: true, at: '2026-11-05T10:00:00.000Z' } } };
    const m = build(progress, catalog);
    walk(plain(m), (v, path) => {
      if (typeof v === 'string' && !path.endsWith('.alt')) expect(v.trim(), path).not.toBe(''); // alt:'' 는 규격이 허용하는 장식용 표지
      expect(v === null || v === undefined, path).toBe(false);
    });
    expect(m.tiles[0].accent).toBeUndefined(); // 해석 못 하는 색은 새 색을 만들지 않고 뺀다
    expect(m.tiles[0].data.title).toBe('가상 공백');
    expectValid(m);
  });

  it('clip: trims, cuts with an ellipsis, never splits a surrogate pair, drops blanks', () => {
    expect(clip('  hi  ', 5)).toBe('hi');
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('😀😀😀', 4)).toBe('😀…');
    expect(clip('   ', 5)).toBeUndefined();
    expect(clip(undefined, 5)).toBeUndefined();
    expect(firstChar('😀 가')).toBe('😀');
  });

  it('dates are explicit (M/D, with the year only when it differs from now)', () => {
    const ms = Date.UTC(2026, 10, 5, 12, 0, 0);
    expect(dateLabel(ms, SAMPLE_NOW)).toBe('11/5');
    expect(dateLabel(Date.UTC(2025, 10, 5, 12, 0, 0), SAMPLE_NOW)).toBe('2025/11/5');
    expect(JSON.stringify(build())).not.toMatch(/어제|오늘|그제|일 전/);
  });
});

describe('accent', () => {
  it('converts #hex to {h, s}', () => {
    expect(hexToAccent('#FF0000')).toEqual({ h: 0, s: 1 });
    expect(hexToAccent('#f00')).toEqual({ h: 0, s: 1 });
    expect(hexToAccent('#166FBB')).toEqual({ h: 208, s: 0.79 });
    expect(hexToAccent('#00ff00ff')).toEqual({ h: 120, s: 1 });
    expect(hexToAccent('#808080')).toEqual({ h: 0, s: 0 });
    const a = hexToAccent('#4b0082')!;
    expect(a.h).toBeGreaterThanOrEqual(0);
    expect(a.h).toBeLessThanOrEqual(360);
    expect(a.s).toBeGreaterThanOrEqual(0);
    expect(a.s).toBeLessThanOrEqual(1);
    for (const bad of [undefined, null, '', 'red', '#12', '#12345', '166FBB']) expect(hexToAccent(bad)).toBeUndefined();
  });
});

describe('inputs and states', () => {
  it('is deterministic: same input → same output, whatever the catalog order', () => {
    const a = JSON.stringify(build());
    expect(JSON.stringify(build())).toBe(a);
    expect(JSON.stringify(build(sampleProgress, [...sampleCatalog].reverse()))).toBe(a);
  });

  it('empty state: no records → no tiles (and nothing to upload)', () => {
    const m = build({}, sampleCatalog);
    expect(m.tiles).toEqual([]);
    expectValid(m);
    expect(hasAnyRecord({})).toBe(false);
    expect(hasAnyRecord({ s: { a: { done: false, at: EPOCH_AT } } })).toBe(false);
    expect(hasAnyRecord(sampleProgress)).toBe(true);
  });

  it('ignores tombstones; v1-converted (EPOCH) records still count but carry no date', () => {
    const progress: ProgressV2 = {
      'sample-a': { 'sample-a-e1': { done: true, at: EPOCH_AT }, 'sample-a-e2': { done: true, at: EPOCH_AT }, 'sample-a-e3': { done: false, at: '2026-11-06T10:00:00.000Z' } },
    };
    const m = build(progress);
    expect(m.tiles.map((t) => t.id)).toEqual(['now', 'next']);
    const data = m.tiles[0].data as { pill?: string; progress: { value: number } };
    expect(data.pill).toBeUndefined();
    expect(data.progress.value).toBe(2);
    expectValid(m);
  });

  it('skips series without episodes and records for series no longer in the catalog', () => {
    const progress: ProgressV2 = { gone: { x: { done: true, at: '2026-11-05T10:00:00.000Z' } }, empty: { y: { done: true, at: '2026-11-05T10:00:00.000Z' } } };
    const catalog = [sampleSeries('empty', '가상 빈 작품', 0, '#000000', null)];
    expect(build(progress, catalog).tiles).toEqual([]);
  });

  it('a series with every episode done is finished: no "now" mark, dated "완주" pill', () => {
    const m = build({ 'sample-b': sampleProgress['sample-b'] });
    expect(m.tiles.map((t) => t.id)).toEqual(['now', 'done']);
    expect((m.tiles[0].data as { pill: string }).pill).toBe('11/4 완주');
    expect((m.tiles[0].data as { list: Array<{ now?: boolean }> }).list[0].now).toBeUndefined();
    expectValid(m);
  });

  it('generated_at comes from now', () => {
    expect(build().generated_at).toBe(new Date(SAMPLE_NOW).toISOString());
  });
});
