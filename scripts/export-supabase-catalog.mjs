#!/usr/bin/env node
// Supabase의 series / seasons / episodes / volumes를 src/data/series/<series-id>.json으로 내보낸다.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... npm run export:catalog
//
// - 공개 읽기(RLS: anon SELECT 허용) 테이블만 읽는다. user_progress / profiles는 읽지 않는다.
// - 모든 id(UUID)를 그대로 보존하므로 기존 진행 기록(completed_ids)이 그대로 맞는다.
// - 키는 환경변수로만 받고 어디에도 기록하지 않는다.
// - 의존성 없음 (Node 18+ 내장 fetch).
import { mkdir, readdir, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'series');
const PAGE = 500;

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_ANON_KEY;
const clean = process.argv.includes('--clean');

if (!url || !key) {
  console.error('SUPABASE_URL 과 SUPABASE_ANON_KEY 환경변수를 설정하세요.');
  process.exit(1);
}

const select = [
  'id,title,description,cover_url,banner_url,accent_color,youtube_bgm_id,created_at',
  'seasons(id,name,start_chapter,end_chapter,created_at)',
  'episodes(id,episode_number,title,start_chapter,end_chapter,cover_url,duration,created_at)',
  'volumes(id,volume_number,start_chapter,end_chapter,cover_url,created_at)',
].join(',');

async function fetchAllSeries() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/series?select=${select}&order=created_at.desc,id.asc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`Supabase 요청 실패 ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// 파일 diff가 안정적이도록 start_chapter → created_at → id 순으로 정렬
const order = (a, b) =>
  Number(a.start_chapter) - Number(b.start_chapter) ||
  String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
  String(a.id).localeCompare(String(b.id));

const num = (v) => (v == null ? null : Number(v));
const nonNullNum = (v, where) => {
  if (v == null || !Number.isFinite(Number(v))) throw new Error(`숫자가 아닌 값: ${where} = ${v}`);
  return Number(v);
};

function toRecord(s) {
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    cover_url: s.cover_url ?? null,
    banner_url: s.banner_url ?? null,
    accent_color: s.accent_color ?? '#03acb1',
    youtube_bgm_id: s.youtube_bgm_id ?? null,
    created_at: s.created_at,
    seasons: [...(s.seasons ?? [])].sort(order).map((x) => ({
      id: x.id,
      name: x.name,
      start_chapter: nonNullNum(x.start_chapter, `${s.title} season ${x.id}`),
      end_chapter: num(x.end_chapter),
    })),
    episodes: [...(s.episodes ?? [])].sort(order).map((x) => ({
      id: x.id,
      episode_number: String(x.episode_number),
      title: x.title ?? null,
      start_chapter: nonNullNum(x.start_chapter, `${s.title} ep ${x.episode_number}`),
      end_chapter: nonNullNum(x.end_chapter, `${s.title} ep ${x.episode_number}`),
      cover_url: x.cover_url ?? null,
      duration: num(x.duration),
    })),
    volumes: [...(s.volumes ?? [])].sort(order).map((x) => ({
      id: x.id,
      volume_number: nonNullNum(x.volume_number, `${s.title} vol`),
      start_chapter: nonNullNum(x.start_chapter, `${s.title} vol ${x.volume_number}`),
      end_chapter: nonNullNum(x.end_chapter, `${s.title} vol ${x.volume_number}`),
      cover_url: x.cover_url ?? null,
    })),
  };
}

const series = await fetchAllSeries();
await mkdir(OUT_DIR, { recursive: true });

const written = new Set();
let items = 0;
for (const s of series) {
  const record = toRecord(s);
  const file = `${record.id}.json`;
  await writeFile(join(OUT_DIR, file), JSON.stringify(record, null, 2) + '\n');
  written.add(file);
  items += record.episodes.length + record.volumes.length;
  console.log(
    `✓ ${file}  ${record.title}  (seasons ${record.seasons.length}, episodes ${record.episodes.length}, volumes ${record.volumes.length})`
  );
}

const stale = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.json') && !written.has(f));
for (const f of stale) {
  if (clean) {
    await unlink(join(OUT_DIR, f));
    console.log(`✗ 삭제: ${f} (Supabase에 없음)`);
  } else {
    console.warn(`! ${f}는 Supabase에 없습니다 (--clean 으로 삭제)`);
  }
}

console.log(`\n${series.length}개 시리즈, 진행 항목(에피소드+권) ${items}개를 ${OUT_DIR}에 기록했습니다. id는 원본 그대로입니다.`);
