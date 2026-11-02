/**
 * Turning a `media_progress` proposal into exact episode/volume IDs of a catalogued series.
 * Never guesses: an ambiguous title becomes a choice for the owner, and a number that does not exist
 * is reported instead of being rounded to something else.
 */
import type { SeriesRecord } from '../types';
import type { ProgressProposal } from './remote';

/** NFKC, lower case, letters and digits only. */
export const normalizeTitle = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** "주술회전 (呪術廻戦)" → ["주술회전 (呪術廻戦)", "주술회전", "呪術廻戦"]: the full title and each part. */
const titleParts = (title: string) => {
  const parts = [title, title.replace(/\s*[([].*?[)\]]\s*/g, ' ')];
  for (const m of title.matchAll(/[([](.*?)[)\]]/g)) parts.push(m[1]);
  return parts.map(normalizeTitle).filter(Boolean);
};

/** Series the proposal may mean; `exact` only when exactly one series has that title (or title part). */
export function findSeries<S extends SeriesRecord>(title: string, catalog: S[]): { exact: S | null; choices: S[] } {
  const wanted = normalizeTitle(title);
  if (!wanted) return { exact: null, choices: [] };
  const same = catalog.filter((s) => titleParts(s.title).includes(wanted));
  if (same.length === 1) return { exact: same[0], choices: same };
  if (same.length > 1) return { exact: null, choices: same };
  const near = catalog.filter((s) => titleParts(s.title).some((p) => wanted.length >= 2 && (p.includes(wanted) || wanted.includes(p))));
  return { exact: null, choices: near.slice(0, 8) };
}

export interface ProgressPlan {
  /** IDs to mark complete, in timeline order */
  ids: string[];
  /** Human labels of those items ("Ep 13", "Vol 3") */
  labels: string[];
  /** Requested numbers that do not exist in this series (or season) */
  missing: number[];
}

type Item = { id: string; number: string };

/** Timeline order (original chapters), as AniMan's catalogue orders items. */
const byStart = <T extends { start_chapter: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => Number(a.start_chapter) - Number(b.start_chapter));

const itemsOf = (series: SeriesRecord, kind: 'episode' | 'volume'): Item[] =>
  kind === 'episode'
    ? byStart(series.episodes).map((e) => ({ id: e.id, number: String(e.episode_number) }))
    : byStart(series.volumes).map((v) => ({ id: v.id, number: String(v.volume_number) }));

/** Episodes of the nth season (seasons ordered by start chapter; an episode belongs where its first chapter falls). */
function seasonEpisodes(series: SeriesRecord, season: number): Item[] | null {
  const seasons = [...series.seasons].sort((a, b) => a.start_chapter - b.start_chapter);
  const s = seasons[season - 1];
  if (!s) return null;
  return byStart(series.episodes)
    .filter((e) => e.start_chapter >= s.start_chapter && (s.end_chapter == null || e.start_chapter <= s.end_chapter))
    .map((e) => ({ id: e.id, number: String(e.episode_number) }));
}

/**
 * What approving would mark. `up_to` marks everything up to and including that item in timeline order
 * (same as "여기까지 완료"); `numbers` marks only those. With `season`, numbers count within the season.
 */
export function planProgress(series: SeriesRecord, p: Pick<ProgressProposal, 'kind' | 'season' | 'upTo' | 'numbers'>): ProgressPlan {
  const all = itemsOf(series, p.kind);
  const scope = p.kind === 'episode' && p.season !== null ? seasonEpisodes(series, p.season) : all;
  const label = (it: Item) => `${p.kind === 'episode' ? 'Ep' : 'Vol'} ${it.number}`;
  if (!scope) return { ids: [], labels: [], missing: p.upTo !== null ? [p.upTo] : [...(p.numbers ?? [])] };
  // Within a season, the nth episode of the season; otherwise the item whose own number is n.
  const pick = (n: number): Item | undefined =>
    p.season !== null && p.kind === 'episode' ? scope[n - 1] : scope.find((it) => it.number === String(n));
  if (p.upTo !== null) {
    const target = pick(p.upTo);
    if (!target) return { ids: [], labels: [], missing: [p.upTo] };
    const upto = all.slice(0, all.findIndex((it) => it.id === target.id) + 1);
    return { ids: upto.map((it) => it.id), labels: upto.map(label), missing: [] };
  }
  const found: Item[] = [];
  const missing: number[] = [];
  for (const n of p.numbers ?? []) {
    const it = pick(n);
    if (it) found.push(it); else missing.push(n);
  }
  const order = new Map(all.map((it, i) => [it.id, i]));
  found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { ids: found.map((it) => it.id), labels: found.map(label), missing };
}
