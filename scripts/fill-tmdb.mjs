#!/usr/bin/env node
// scripts/fill-tmdb.mjs
// 작품 데이터(src/data/series/*.json)에 TMDB 항목(tmdb_id, tmdb_media_type, tmdb_poster_path)을 채운다.
// 보드 타일의 표지 주소(https://image.tmdb.org/t/p/w780<poster_path>)를 만드는 데만 쓴다.
//
// 키는 앱에도 저장소에도 넣지 않는다. 환경 변수로만 받는다:
//   TMDB_READ_TOKEN=<API 읽기 액세스 토큰(v4)>   또는   TMDB_API_KEY=<API 키(v3)>
//
// 1) 조회만(아무것도 쓰지 않음): 작품마다 찾은 TMDB 항목을 표로 보여 준다. 동명 작품 오매칭이 없는지 눈으로 확인한다.
//      TMDB_READ_TOKEN=... node scripts/fill-tmdb.mjs
// 2) 확인한 뒤 저장: 각 작품의 1순위 후보를 JSON에 쓴다. 다른 후보를 쓰려면 --pick <작품 id 앞부분>=<tv|movie>:<tmdb id>
//      TMDB_READ_TOKEN=... node scripts/fill-tmdb.mjs --write --pick 7034cdbd=tv:203737
//    --only <작품 id 앞부분> 으로 한 작품만 처리할 수 있다.
// 포스터: 한국어(ko) 포스터가 있으면 그것을, 없으면 원어 포스터를, 그것도 없으면 TMDB 대표 포스터를 고른다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.themoviedb.org/3';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'series');
const token = process.env.TMDB_READ_TOKEN;
const key = process.env.TMDB_API_KEY;
if (!token && !key) {
  console.error('TMDB_READ_TOKEN 또는 TMDB_API_KEY 환경 변수가 필요합니다. (키는 커밋하지 마세요)');
  process.exit(1);
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const valueOf = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const picks = Object.fromEntries(
  valueOf('--pick').map((v) => {
    const [prefix, rest] = String(v).split('=');
    const [type, id] = String(rest).split(':');
    return [prefix, { type, id: Number(id) }];
  })
);
const only = valueOf('--only')[0];

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!token) url.searchParams.set('api_key', key);
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return res.json();
}

/** "주술회전 (呪術廻戦)" → ["주술회전 (呪術廻戦)", "주술회전", "呪術廻戦"] */
const queries = (title) => {
  const t = title.trim();
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(t);
  return [...new Set([t, ...(m ? [m[1].trim(), m[2].trim()] : [])].filter(Boolean))];
};

async function search(title) {
  const found = new Map();
  for (const q of queries(title)) {
    for (const type of ['tv', 'movie']) {
      const r = await tmdb(`/search/${type}`, { query: q, language: 'ko-KR' });
      for (const x of (r.results ?? []).slice(0, 4)) {
        const id = `${type}:${x.id}`;
        if (!found.has(id)) {
          found.set(id, {
            type, id: x.id,
            name: x.name ?? x.title, original: x.original_name ?? x.original_title,
            date: x.first_air_date ?? x.release_date ?? '', lang: x.original_language, poster: x.poster_path ?? null,
          });
        }
      }
    }
  }
  return [...found.values()];
}

/** 한국어 포스터 → 원어 포스터 → 대표 포스터 순으로 고른다. */
async function pickPoster(type, id, originalLanguage, fallback) {
  const r = await tmdb(`/${type}/${id}/images`, { include_image_language: `ko,${originalLanguage ?? 'en'},null` });
  const posters = (r.posters ?? []).slice().sort((a, b) => b.vote_average - a.vote_average || b.width - a.width);
  const ko = posters.find((p) => p.iso_639_1 === 'ko');
  const orig = posters.find((p) => p.iso_639_1 === originalLanguage);
  const chosen = ko ?? orig;
  return { path: chosen?.file_path ?? fallback ?? null, source: ko ? 'ko' : orig ? originalLanguage : fallback ? 'default' : 'none' };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)));
const rows = [];
for (const file of files) {
  const path = join(DIR, file);
  const series = JSON.parse(readFileSync(path, 'utf8'));
  const prefix = file.slice(0, 8);
  const candidates = await search(series.title);
  let chosen = candidates[0];
  const forced = Object.entries(picks).find(([p]) => file.startsWith(p))?.[1];
  if (forced) chosen = candidates.find((c) => c.type === forced.type && c.id === forced.id) ?? { type: forced.type, id: forced.id, name: '(직접 지정)', original: '', date: '', lang: 'ja', poster: null };
  console.log(`\n■ ${prefix}  ${series.title}`);
  candidates.slice(0, 6).forEach((c, i) =>
    console.log(`   ${c === chosen ? '→' : ' '} ${i + 1}. ${c.type}:${c.id}  ${c.name} / ${c.original}  ${c.date}  [${c.lang}]`)
  );
  if (!chosen) {
    rows.push({ prefix, title: series.title, result: '후보 없음' });
    continue;
  }
  const poster = await pickPoster(chosen.type, chosen.id, chosen.lang, chosen.poster);
  rows.push({ prefix, title: series.title, result: `${chosen.type}:${chosen.id} ${chosen.name}`, poster: `${poster.path ?? '없음'} (${poster.source})` });
  if (write && poster.path) {
    series.tmdb_id = chosen.id;
    series.tmdb_media_type = chosen.type;
    series.tmdb_poster_path = poster.path;
    writeFileSync(path, JSON.stringify(series, null, 2) + '\n');
  }
}
console.log('\n요약');
console.table(rows);
console.log(write ? '--write: 포스터를 찾은 작품의 JSON을 갱신했습니다. git diff 로 확인하세요.' : '조회만 했습니다. 맞으면 --write 를 붙여 다시 실행하세요.');
