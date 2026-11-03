import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_FLOOR_KEY } from '../lib/progress/clock';
import { mergeProgressV2 } from '../lib/progress/merge';
import type { ProgressV2 } from '../lib/progress/model';
import { itemsDeletedElsewhere, removeItems } from '../lib/progress/staleReview';
import { createFakeSyncServer, type FakeSyncServer } from '../test/fakeSyncServer';
import { LIFEHUB_ORIGIN, type Deps } from './remote';
import { readState, STALE_DEVICE_MS, updateState, type SyncHost } from './sync';
import { createSyncController } from './syncController';

// 180일 넘게 쉰 기기의 검토 흐름 (docs/P6_SYNC.md 7절). 합성 데이터, 가짜 서버만.
const API = LIFEHUB_ORIGIN + '/animan/v1';
const START = Date.UTC(2026, 0, 1, 9);
const DAY = 86_400_000;
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const entry = (done: boolean, ms: number) => ({ done, at: new Date(ms).toISOString() });
const tick = () => new Promise<void>((r) => setImmediate(r));

function device(server: FakeSyncServer, progress: ProgressV2 = {}) {
  const storage = memory();
  storage.setItem('animan.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: 10 ** 13, scope: 'animan:inbox animan:sync' }));
  const calls: string[] = [];
  const local = { progress };
  const deps: Deps = {
    storage, session: memory(), now: () => Date.now(), random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).slice(API.length);
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      const res = await server.handle({ method: init?.method ?? 'GET', path, headers: { ...(init?.headers as Record<string, string>) }, body: init?.body as string | undefined });
      return new Response(res.body, { status: res.status, headers: res.headers });
    }) as typeof fetch,
  };
  const host: SyncHost = {
    snapshot: () => local.progress,
    applyRemote: (r) => (local.progress = mergeProgressV2(local.progress, r)),
    applyStaleReview: (remove, srv, floor) => {
      const ok = new Set(remove.map((i) => `${i.seriesId}/${i.itemId}`));
      const gone = srv && floor !== null ? itemsDeletedElsewhere(local.progress, srv, floor).filter((i) => ok.has(`${i.seriesId}/${i.itemId}`)) : [];
      local.progress = mergeProgressV2(removeItems(local.progress, gone), srv ?? {});
    },
  };
  const controller = createSyncController({ deps, host, onLocalChange: () => () => {}, userAgent: 'Chrome/120 Linux' });
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(0);
    const started = performance.now();
    while (controller.getSnapshot().phase === 'syncing' && performance.now() - started < 5000) await tick();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { controller, deps, storage, calls, local, settle, puts: () => calls.filter((c) => c.startsWith('PUT')).length };
}

/** Another device overwrites the server document (e.g. it deleted an item long ago and its tombstone was pruned). */
async function serverRewrite(server: FakeSyncServer, progress: ProgressV2) {
  const current = server.current()!;
  const res = await server.handle({
    method: 'PUT', path: '/sync',
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json', 'If-Match': `"${current.version}"` },
    body: JSON.stringify({ app: 'animan', version: 2, exportedAt: new Date(Date.now()).toISOString(), progress }),
  });
  expect(res.status).toBe(200);
}

let server: FakeSyncServer;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(START);
  localStorage.clear();
  server = createFakeSyncServer({ now: () => Date.now() });
});
afterEach(() => vi.useRealTimers());

/** A device that synced `x` and `keep` once, then fell asleep for 181 days. */
async function staleDevice(offlineEdit?: (nowMs: number) => ProgressV2) {
  const a = device(server, { s: { x: entry(true, START - 1000), keep: entry(true, START - 1000) } });
  a.controller.setEnabled(true);
  await a.settle();
  expect(a.controller.getSnapshot().phase).toBe('idle');
  await serverRewrite(server, { s: { keep: entry(true, START - 1000), z: entry(true, START + 5000) } }); // x deleted elsewhere
  vi.setSystemTime(START + STALE_DEVICE_MS + DAY);
  if (offlineEdit) a.local.progress = mergeProgressV2(a.local.progress, offlineEdit(Date.now())); // stamped after F
  a.controller.refresh();
  expect(a.controller.getSnapshot().phase).toBe('needs_review');
  return a;
}

describe('stale-device review flow', () => {
  it('previews the removal without changing anything, and F is read before the review fetch', async () => {
    const a = await staleDevice();
    const floorBefore = localStorage.getItem(CLOCK_FLOOR_KEY);
    expect(floorBefore).not.toBeNull();
    const before = JSON.stringify(a.local.progress);
    a.calls.length = 0;
    const plan = await a.controller.prepareReview();
    expect(plan.remove.map((i) => `${i.seriesId}/${i.itemId}`)).toEqual(['s/x']);
    expect(plan.floorMs).toBe(Number(floorBefore));
    expect(Object.keys(plan.result.s).sort()).toEqual(['keep', 'z']);
    expect(a.calls).toEqual(['GET /sync']); // one read, no write
    expect(localStorage.getItem(CLOCK_FLOOR_KEY)).toBe(floorBefore); // the review fetch did not move F
    expect(JSON.stringify(a.local.progress)).toBe(before);
    expect(a.controller.getSnapshot().phase).toBe('needs_review');
  });

  it('cancelling (never applying) leaves local data, the review state and the stop of automatic sync as they were', async () => {
    const a = await staleDevice();
    const before = JSON.stringify(a.local.progress);
    const state = JSON.stringify(readState(a.storage));
    await a.controller.prepareReview(); // the preview was shown, then the owner cancelled
    a.calls.length = 0;
    a.controller.request('manual');
    a.controller.request('start');
    await a.settle();
    expect(JSON.stringify(a.local.progress)).toBe(before);
    expect(JSON.stringify(readState(a.storage))).toBe(state);
    expect(a.controller.getSnapshot().phase).toBe('needs_review');
    expect(a.calls).toEqual([]);
    expect(server.document()!.progress.s.x).toBeUndefined();
  });

  it('after confirming: the deleted item is gone for good, real offline edits stay, and the server converges without a resurrection', async () => {
    let edit = entry(true, 0); // made offline after the last sync, so later than F
    const a = await staleDevice((now) => ({ s: { y: (edit = entry(true, now)) } }));
    const plan = await a.controller.prepareReview();
    expect(plan.remove.map((i) => i.itemId)).toEqual(['x']);
    a.controller.applyReview(plan);
    expect(a.local.progress.s.x).toBeUndefined(); // no tombstone either
    expect(a.controller.getSnapshot().phase).toBe('syncing');
    await a.settle();
    expect(a.controller.getSnapshot().phase).toBe('idle');
    expect(readState(a.storage).lastSyncAt).toBe(Date.now());
    const doc = server.document()!.progress;
    expect(doc.s.x).toBeUndefined();
    expect(Object.keys(doc.s).sort()).toEqual(['keep', 'y', 'z']);
    expect(doc.s.y).toEqual(edit);
    expect(a.local.progress).toEqual(doc);
    // a second device pulling now sees the same thing
    const b = device(server);
    b.controller.setEnabled(true);
    await b.settle();
    expect(b.local.progress).toEqual(doc);
  });

  it('server document is 404: nothing is removed; confirming just syncs like a first write', async () => {
    const a = device(server, { s: { x: entry(true, START - 1000) } });
    updateState(a.storage, { enabled: true, lastSyncAt: START - STALE_DEVICE_MS - DAY, version: 3 });
    localStorage.setItem(CLOCK_FLOOR_KEY, String(START - 2000));
    a.controller.refresh();
    expect(a.controller.getSnapshot().phase).toBe('needs_review');
    const plan = await a.controller.prepareReview();
    expect(plan.server).toBeNull();
    expect(plan.remove).toEqual([]);
    a.controller.applyReview(plan);
    await a.settle();
    expect(a.local.progress.s.x).toBeDefined();
    expect(a.calls.filter((c) => c.startsWith('PUT'))).toHaveLength(1);
    expect(server.document()!.progress.s.x).toBeDefined();
  });

  it('F unknown (the device never saw a server time): nothing is removed even though the server has a document', async () => {
    const a = device(server, { s: { old: entry(true, START - 9999) } });
    // seed the server through another device
    const seeder = device(server, { s: { other: entry(true, START) } });
    seeder.controller.setEnabled(true);
    await seeder.settle();
    localStorage.removeItem(CLOCK_FLOOR_KEY); // this device's floor is unknown
    updateState(a.storage, { enabled: true, lastSyncAt: START - STALE_DEVICE_MS - DAY });
    a.controller.refresh();
    const plan = await a.controller.prepareReview();
    expect(plan.floorMs).toBeNull();
    expect(plan.remove).toEqual([]);
    expect(plan.result.s.old).toBeDefined();
    a.controller.applyReview(plan);
    await a.settle();
    expect(Object.keys(server.document()!.progress.s).sort()).toEqual(['old', 'other']);
  });

  it('a review that cannot read the server ends in an error and leaves everything as it was', async () => {
    const a = await staleDevice();
    const before = JSON.stringify(a.local.progress);
    const real = a.deps.fetch;
    a.deps.fetch = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(a.controller.prepareReview()).rejects.toBeTruthy();
    a.deps.fetch = real;
    expect(JSON.stringify(a.local.progress)).toBe(before);
    expect(a.controller.getSnapshot().phase).toBe('needs_review');
  });
});
