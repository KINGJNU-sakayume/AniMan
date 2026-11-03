import { describe, expect, it } from 'vitest';
import { syntheticSeries } from '../test/fixtures';
import type { SeriesRecord } from '../types';
import { autoPlan, findSeries, normalizeTitle, planProgress } from './resolve';
import {
  autoApplyEnabled, seriesRefs, setAutoApply, uploadSeriesRefs,
  beginConnect, CALLBACK_KEY, CALLBACK_URL, CLIENT_ID, completeStoredCallback, isConnected, LIFEHUB_ORIGIN,
  parseProposal, rejectLocally, rememberReceipt, RESOURCE, sync, type Deps,
} from './remote';

// Synthetic data only.
const KEY = 'claude:mcp-' + 'a'.repeat(40);
const candidate = (payload: Record<string, unknown>, key = KEY) => {
  const i = key.indexOf(':');
  return { key, candidate: { schema_version: 1, candidate_type: 'media_progress', source: key.slice(0, i), idempotency_key: key.slice(i + 1), created_at: '2026-11-02T01:00:00Z', payload } };
};

describe('proposal contract', () => {
  it('accepts up_to or numbers, season only for episodes', () => {
    expect(parseProposal(candidate({ title: '가상 애니', kind: 'episode', season: 2, up_to: 5 }))).toEqual({
      key: KEY, createdAt: '2026-11-02T01:00:00Z', title: '가상 애니', kind: 'episode', season: 2, upTo: 5, numbers: null, note: null,
      status: 'pending', needsAppReview: false,
    });
    expect(parseProposal(candidate({ title: '가상 만화', kind: 'volume', numbers: [2, 1] }))?.numbers).toEqual([2, 1]);
    for (const bad of [
      { title: 'x', kind: 'episode' },
      { title: 'x', kind: 'episode', up_to: 1, numbers: [1] },
      { title: 'x', kind: 'volume', season: 1, up_to: 1 },
      { title: 'x', kind: 'episode', numbers: [1, 1] },
      { title: 'x', kind: 'episode', up_to: 1, series_id: 's' },
    ]) expect(parseProposal(candidate(bad))).toBeNull();
  });
});

const twoSeasons: SeriesRecord = syntheticSeries({
  id: 'two', title: '가상 애니 (仮想アニメ)',
  seasons: [{ id: 's1', name: 'S1', start_chapter: 1, end_chapter: 8 }, { id: 's2', name: 'S2', start_chapter: 9, end_chapter: 20 }],
});
const other: SeriesRecord = syntheticSeries({ id: 'other', title: '가상 애니 극장판' });

describe('matching and planning', () => {
  it('matches a title or a part of it, and offers choices otherwise', () => {
    expect(normalizeTitle('가상 애니!')).toBe(normalizeTitle('가상애니'));
    expect(findSeries('가상애니', [twoSeasons, other]).exact?.id).toBe('two');
    expect(findSeries('仮想アニメ', [twoSeasons, other]).exact?.id).toBe('two');
    expect(findSeries('극장판', [twoSeasons, other]).choices.map((s) => s.id)).toEqual(['other']);
    expect(findSeries('극장판', [twoSeasons, other]).exact).toBeNull();
    expect(findSeries('없는 작품', [twoSeasons]).choices).toEqual([]);
  });

  it('up_to marks everything before it in timeline order; numbers mark only those', () => {
    expect(planProgress(twoSeasons, { kind: 'episode', season: null, upTo: 2, numbers: null }))
      .toEqual({ ids: ['ep-1', 'ep-2'], labels: ['Ep 1', 'Ep 2'], missing: [] });
    expect(planProgress(twoSeasons, { kind: 'volume', season: null, upTo: null, numbers: [2, 9] }))
      .toEqual({ ids: ['vol-2'], labels: ['Vol 2'], missing: [9] });
    expect(planProgress(twoSeasons, { kind: 'episode', season: null, upTo: 7, numbers: null }).missing).toEqual([7]);
  });

  it('counts within a season ("2기 1화" = first episode of season 2)', () => {
    // Season 2 (chapters 9–20) holds ep-3 and the OVA, in chapter order.
    expect(planProgress(twoSeasons, { kind: 'episode', season: 2, upTo: 1, numbers: null }).ids).toEqual(['ep-1', 'ep-2', 'ep-3']);
    expect(planProgress(twoSeasons, { kind: 'episode', season: 2, upTo: null, numbers: [2] }).ids).toEqual(['ep-ova']);
    expect(planProgress(twoSeasons, { kind: 'episode', season: 3, upTo: 1, numbers: null }).missing).toEqual([1]);
  });
});

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function makeDeps(handler: (url: string, init?: RequestInit) => Response): Deps & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let n = 0;
  return {
    calls, storage: memory(), session: memory(), now: () => 1_000_000,
    random: (len) => new Uint8Array(len).fill(++n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), init }); return handler(String(input), init); }) as typeof fetch,
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = () => json({ access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', token_type: 'Bearer', expires_in: 3600 });

describe('connection and sync', () => {
  it('PKCE, callback check, receipts and rejections once', async () => {
    const other = 'claude:mcp-' + 'b'.repeat(40);
    const fresh = 'claude:mcp-' + 'c'.repeat(40);
    const base = { title: '가상 애니', kind: 'episode', up_to: 1 };
    const deps = makeDeps((url) => (url.endsWith('/oauth/token') ? tokens()
      : url.includes('/candidates') ? json({ candidates: [candidate(base), candidate(base, other), candidate(base, fresh)] })
      : json({ ok: true })));
    const url = new URL(await beginConnect(deps));
    expect([url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'), url.searchParams.get('scope'), url.searchParams.get('resource')])
      .toEqual([CLIENT_ID, CALLBACK_URL, 'animan:inbox', RESOURCE]);
    deps.session.setItem(CALLBACK_KEY, `?code=c&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`);
    expect(await completeStoredCallback(deps)).toBe(true);
    expect(isConnected(deps)).toBe(true);
    deps.calls.length = 0;

    rememberReceipt(KEY, 'two', deps);
    rejectLocally(other, deps);
    const first = await sync(deps);
    expect(first.proposals.map((p) => p.key)).toEqual([fresh]);
    const posted = deps.calls.filter((c) => c.init?.method === 'POST').map((c) => JSON.parse(String(c.init?.body)));
    expect(posted).toEqual([{ key: KEY, entity_type: 'media_progress', entity_id: 'two' }, { key: other }]);
    deps.calls.length = 0;
    await sync(deps);
    expect(deps.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0);

    const forged = makeDeps(() => tokens());
    await beginConnect(forged);
    forged.session.setItem(CALLBACK_KEY, '?code=c&state=forged');
    await expect(completeStoredCallback(forged)).rejects.toMatchObject({ kind: 'state' });
  });
});

// ── Life Hub cards stage 6: card approvals and the shared catalogue ──

async function connected(handler: (url: string, init?: RequestInit) => Response) {
  const deps = makeDeps((url, init) => (url.endsWith('/oauth/token') ? tokens() : handler(url, init)));
  const url = new URL(await beginConnect(deps));
  deps.session.setItem(CALLBACK_KEY, `?code=c&state=${url.searchParams.get('state')}`);
  await completeStoredCallback(deps);
  return deps;
}

describe('card approvals', () => {
  const approved = (payload: Record<string, unknown>, extra: Record<string, unknown> = {}, key = KEY) => ({ ...candidate(payload, key), status: 'approved', needs_app_review: false, final_candidate: null, ...extra });

  it('reads the hub state, prefers the owner\'s card edit and accepts codex', () => {
    const edited = approved({ title: '가상 애니 극장판', kind: 'episode', up_to: 9 }, { final_candidate: candidate({ title: '가상 애니', kind: 'episode', season: 2, up_to: 3 }).candidate });
    expect(parseProposal(edited)).toMatchObject({ title: '가상 애니', season: 2, upTo: 3, status: 'approved', needsAppReview: false });
    expect(parseProposal({ ...edited, status: 'rejected' })).toBeNull();
    expect(parseProposal(approved({ title: 'x', kind: 'volume', up_to: 1 }, {}, 'codex:mcp-' + 'c'.repeat(40)))).not.toBeNull();
  });

  it('marks without asking only when approved, exact, complete and allowed', () => {
    const p = parseProposal(approved({ title: '가상애니', kind: 'episode', season: 2, up_to: 1 }))!;
    const auto = autoPlan(p, [twoSeasons, other], true);
    expect(auto?.series.id).toBe('two');
    expect(auto?.plan.missing).toEqual([]);
    expect(autoPlan(p, [twoSeasons, other], false)).toBeNull();
    expect(autoPlan({ ...p, status: 'pending' }, [twoSeasons, other], true)).toBeNull();
    expect(autoPlan({ ...p, needsAppReview: true }, [twoSeasons, other], true)).toBeNull();
    expect(autoPlan({ ...p, title: '가상 애니 극' }, [twoSeasons, other], true)).toBeNull();
    expect(autoPlan({ ...p, season: 9 }, [twoSeasons], true), 'a number that does not exist waits').toBeNull();
  });

  it('auto-apply is on by default and per device', () => {
    const deps = makeDeps(() => new Response('{}'));
    expect(autoApplyEnabled(deps)).toBe(true);
    setAutoApply(deps, false);
    expect(autoApplyEnabled(deps)).toBe(false);
  });

  it('shares series id, title and accent only, and only when they changed', async () => {
    const refs = seriesRefs([twoSeasons, { ...other, accent_color: 'not-a-colour' }]);
    expect(refs).toEqual([{ id: 'two', label: '가상 애니 (仮想アニメ)', group: twoSeasons.accent_color }, { id: 'other', label: '가상 애니 극장판', group: '#03acb1' }]);
    const puts: Array<{ revision: number; items: unknown[] }> = [];
    const deps = await connected((_url, init) => { if (init?.method === 'PUT') puts.push(JSON.parse(String(init.body))); return new Response('{}'); });
    expect(await uploadSeriesRefs(refs, deps)).toBe(true);
    expect(await uploadSeriesRefs(refs, deps)).toBe(false);
    expect(await uploadSeriesRefs(refs.slice(0, 1), deps)).toBe(true);
    expect(puts).toHaveLength(2);
    expect(puts[1].revision).toBeGreaterThan(puts[0].revision);
  });
});

describe('series list after a 409', () => {
  it('is not recorded as sent, and goes again with a later revision', async () => {
    const revisions: number[] = [];
    let status = 409;
    let now = 1_000_000;
    const deps = await connected((_url, init) => {
      if (init?.method === 'PUT') revisions.push(JSON.parse(String(init.body)).revision);
      return new Response('{}', { status });
    });
    deps.now = () => now;
    const refs = seriesRefs([twoSeasons]);
    expect(await uploadSeriesRefs(refs, deps)).toBe(false);
    now += 60_000;
    status = 200;
    expect(await uploadSeriesRefs(refs, deps)).toBe(true);
    expect(await uploadSeriesRefs(refs, deps)).toBe(false);
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toBeGreaterThan(revisions[0]);
  });
});
