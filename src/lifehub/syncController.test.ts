import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeProgressV2 } from '../lib/progress/merge';
import { itemsDeletedElsewhere, removeItems } from '../lib/progress/staleReview';
import type { ProgressV2 } from '../lib/progress/model';
import { createFakeSyncServer, type FakeSyncServer } from '../test/fakeSyncServer';
import { LIFEHUB_ORIGIN, type Deps } from './remote';
import { readState, STALE_DEVICE_MS, updateState, type SyncHost } from './sync';
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, createSyncController, DEBOUNCE_MS } from './syncController';

// 합성 데이터만. 가짜 서버만 쓰고, 시간은 가짜 타이머로 흘린다.
const API = LIFEHUB_ORIGIN + '/animan/v1';
const START = Date.UTC(2026, 10, 3, 9, 0, 0);
const done = (n: number) => ({ done: true, at: new Date(START + n * 1000).toISOString() });

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

function setup(server: FakeSyncServer, options: { scope?: string; down?: { value: boolean } } = {}) {
  const storage = memory();
  storage.setItem('animan.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: 10 ** 13, scope: options.scope ?? 'animan:inbox animan:sync' }));
  const calls: string[] = [];
  const local = { progress: {} as ProgressV2, listeners: new Set<() => void>() };
  const down = options.down ?? { value: false };
  const deps: Deps = {
    storage, session: memory(), now: () => Date.now(), random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).slice(API.length);
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (down.value) throw new TypeError('offline');
      const res = await server.handle({ method: init?.method ?? 'GET', path, headers: { ...(init?.headers as Record<string, string>) }, body: init?.body as string | undefined });
      return new Response(res.body, { status: res.status, headers: res.headers });
    }) as typeof fetch,
  };
  const emit = () => local.listeners.forEach((l) => l());
  const host: SyncHost = {
    snapshot: () => local.progress,
    applyRemote: (remote) => {
      const merged = mergeProgressV2(local.progress, remote);
      if (JSON.stringify(merged) !== JSON.stringify(local.progress)) {
        local.progress = merged;
        emit(); // the real store notifies on a merge too: the controller must not treat that as a user change
      }
      return local.progress;
    },
  };
  host.applyStaleReview = (remove, server, floor) => {
    const ok = new Set(remove.map((i) => `${i.seriesId}/${i.itemId}`));
    const gone = server && floor !== null ? itemsDeletedElsewhere(local.progress, server, floor).filter((i) => ok.has(`${i.seriesId}/${i.itemId}`)) : [];
    local.progress = mergeProgressV2(removeItems(local.progress, gone), server ?? {});
    emit();
  };
  const controller = createSyncController({
    deps, host, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
    onLocalChange: (l) => {
      local.listeners.add(l);
      return () => void local.listeners.delete(l);
    },
  });
  const change = (id: string) => {
    local.progress = { ...local.progress, s: { ...local.progress.s, [id]: done(1) } };
    emit();
  };
  return { controller, deps, storage, calls, local, change, down, puts: () => calls.filter((c) => c.startsWith('PUT')).length };
}

// A pass uses crypto.subtle, which finishes on a real (unfaked) tick, so waiting means looping on real ticks
// until the controller says it is no longer syncing. Timers and Date are faked; setImmediate stays real.
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
type Ctl = { controller: { getSnapshot(): { phase: string } } };
async function settle(...ts: Ctl[]) {
  await vi.advanceTimersByTimeAsync(0);
  const started = performance.now(); // real clock: Date is faked here
  while (ts.some((t) => t.controller.getSnapshot().phase === 'syncing') && performance.now() - started < 5000) await tick();
  await vi.advanceTimersByTimeAsync(0);
}
/** Moves fake time forward in steps, letting any pass that starts finish before the next step. */
async function advance(t: Ctl, ms: number, step = 2500) {
  for (let left = ms; left > 0; left -= step) {
    await vi.advanceTimersByTimeAsync(Math.min(step, left));
    await settle(t);
  }
}

let server: FakeSyncServer;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(START);
  localStorage.clear();
  server = createFakeSyncServer();
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('sync controller', () => {
  it('does nothing while not connected (sync off), whatever happens', async () => {
    const t = setup(server);
    t.storage.removeItem('animan.lifehub.tokens.v1');
    const stop = t.controller.start();
    t.change('a');
    setVisibility('hidden');
    setVisibility('visible');
    await advance(t, 60_000);
    expect(t.calls).toHaveLength(0);
    expect(t.controller.getSnapshot().phase).toBe('off');
    expect(readState(t.storage).enabled).toBe(false);
    stop();
  });

  it('connected with the sync scope: a stored "off" is switched on at start and it syncs (no on/off switch)', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: false });
    t.change('a');
    const stop = t.controller.start();
    expect(readState(t.storage).enabled).toBe(true);
    await settle(t);
    expect(t.controller.getSnapshot()).toMatchObject({ phase: 'idle', enabled: true, lastSyncAt: START });
    expect(server.document()!.progress.s.a).toBeDefined();
    stop();
  });

  it('connected without the sync scope: switched on but shown as "no permission" and nothing is sent', async () => {
    const t = setup(server, { scope: 'animan:inbox' });
    const stop = t.controller.start();
    await settle(t);
    expect(t.controller.getSnapshot()).toMatchObject({ phase: 'no_permission', enabled: true });
    expect(t.calls).toHaveLength(0);
    stop();
  });

  it('a (re)connect switches a stored "off" on and syncs', async () => {
    const t = setup(server);
    t.change('a');
    t.controller.notifyConnected();
    await settle(t);
    expect(t.controller.getSnapshot()).toMatchObject({ phase: 'idle', enabled: true });
    expect(t.puts()).toBe(1);
  });

  it('turning it on syncs at once; the phase goes syncing → idle and the time is recorded', async () => {
    const t = setup(server);
    t.change('a');
    t.controller.setEnabled(true);
    expect(t.controller.getSnapshot().phase).toBe('syncing');
    await settle(t);
    expect(t.controller.getSnapshot()).toMatchObject({ phase: 'idle', enabled: true, lastSyncAt: START });
    expect(server.document()!.progress.s.a).toBeDefined();
    expect(t.controller.getSnapshot().effectiveLabel).toBe('Chrome on Linux');
  });

  it('pulls on start and when the tab becomes visible again; never polls', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: true });
    const stop = t.controller.start();
    await settle(t);
    expect(t.calls).toEqual(['GET /sync/meta']);
    await advance(t, 60 * 60_000, 60_000); // an hour of nothing
    expect(t.calls).toHaveLength(1);
    setVisibility('hidden'); // nothing pending → nothing sent
    await settle(t);
    expect(t.calls).toHaveLength(1);
    setVisibility('visible');
    await settle(t);
    expect(t.calls).toHaveLength(2);
    stop();
  });

  it('debounces pushes: several changes in a row make one pass after the quiet period', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: true });
    const stop = t.controller.start();
    await settle(t);
    t.calls.length = 0;
    t.change('a');
    await advance(t, DEBOUNCE_MS - 1000);
    t.change('b'); // restarts the wait
    await advance(t, DEBOUNCE_MS - 1);
    expect(t.calls).toHaveLength(0);
    await advance(t, 2);
    await settle(t);
    expect(t.puts()).toBe(1);
    expect(Object.keys(server.document()!.progress.s).sort()).toEqual(['a', 'b']);
    stop();
  });

  it('pushes right away when the tab is hidden with a change waiting', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: true });
    const stop = t.controller.start();
    await settle(t);
    t.calls.length = 0;
    t.change('a');
    setVisibility('hidden');
    await settle(t);
    expect(t.puts()).toBe(1);
    await advance(t, DEBOUNCE_MS * 2); // the cancelled debounce does not push again
    expect(t.puts()).toBe(1);
    stop();
  });

  it('one pass at a time; our own merge into local data does not count as a change to push', async () => {
    const other = setup(server);
    other.change('remote');
    other.controller.setEnabled(true);
    await settle(other);

    const t = setup(server);
    t.change('mine');
    t.controller.setEnabled(true);
    t.controller.request('manual'); // while the first pass is still running
    t.controller.request('manual');
    await settle(t);
    await advance(t, DEBOUNCE_MS * 2);
    await settle(t);
    // merging the remote item into local fired the local listener; no extra debounced pass came from it
    const metas = t.calls.filter((c) => c === 'GET /sync/meta').length;
    expect(metas).toBeLessThanOrEqual(2);
    expect(t.puts()).toBe(1);
    expect(Object.keys(t.local.progress.s).sort()).toEqual(['mine', 'remote']);
    expect(server.versions.length).toBe(2);
  });

  it('network failure → "retry" with exponential, capped back-off, then recovers by itself; local data is never lost', async () => {
    const t = setup(server);
    t.change('a');
    t.down.value = true;
    t.controller.setEnabled(true);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('retry');
    expect(t.local.progress.s.a).toBeDefined();
    const attempts = () => t.calls.length;
    expect(attempts()).toBe(1);
    await advance(t, BACKOFF_BASE_MS - 1);
    expect(attempts()).toBe(1);
    await advance(t, 2);
    expect(attempts()).toBe(2);
    await advance(t, BACKOFF_BASE_MS * 2 - 20); // the second wait is twice as long
    expect(attempts()).toBe(2);
    await advance(t, 40);
    expect(attempts()).toBe(3);
    // the delay never exceeds the cap
    await advance(t, 12 * BACKOFF_MAX_MS, BACKOFF_MAX_MS / 4);
    expect(attempts()).toBeGreaterThan(10);
    expect(attempts()).toBeLessThan(40);
    t.down.value = false;
    await advance(t, BACKOFF_MAX_MS + 1000);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('idle');
    expect(server.document()!.progress.s.a).toBeDefined();
    const settled = t.calls.length;
    await advance(t, 60 * 60_000, 60_000);
    expect(t.calls.length).toBe(settled);
  });

  it('413 stops automatic sync and says so; the manual button tries again', async () => {
    const small = createFakeSyncServer({ maxBytes: 60 });
    const t = setup(small);
    t.change('a');
    t.controller.setEnabled(true);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('too_large');
    expect(readState(t.storage).halt).toBe('too_large');
    expect(t.local.progress.s.a).toBeDefined();
    const sent = t.calls.length;
    t.change('b');
    setVisibility('hidden');
    setVisibility('visible');
    await advance(t, DEBOUNCE_MS * 3);
    expect(t.calls.length).toBe(sent);
    t.controller.request('manual');
    await settle(t);
    expect(t.calls.length).toBeGreaterThan(sent);
    expect(t.controller.getSnapshot().phase).toBe('too_large');
  });

  it.each([400, 415, 428])('%i is shown as an error and is not retried automatically', async (status) => {
    const t = setup(server);
    const real = t.deps.fetch;
    t.deps.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'PUT' ? new Response('{}', { status }) : real(input, init))) as typeof fetch;
    t.change('a');
    t.controller.setEnabled(true);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('error');
    const sent = t.calls.length;
    await advance(t, BACKOFF_MAX_MS * 3, 60_000);
    expect(t.calls.length).toBe(sent);
  });

  it('403 insufficient_scope: "no permission", token kept, no automatic retries until reconnect', async () => {
    server.state.syncScope = false;
    const t = setup(server, { scope: 'animan:inbox animan:sync' });
    t.controller.setEnabled(true);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('no_permission');
    expect(t.storage.getItem('animan.lifehub.tokens.v1')).not.toBeNull();
    const sent = t.calls.length;
    setVisibility('hidden');
    setVisibility('visible');
    await advance(t, BACKOFF_MAX_MS);
    expect(t.calls.length).toBe(sent);
    server.state.syncScope = true; // the owner reconnected with the checkbox
    t.controller.notifyConnected();
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('idle');
  });

  it('a token known to lack the sync scope shows "no permission" without any request', async () => {
    const t = setup(server, { scope: 'animan:inbox' });
    updateState(t.storage, { enabled: true });
    t.controller.start()();
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('no_permission');
    expect(t.calls).toHaveLength(0);
  });

  it('180 days without a successful sync: automatic merge stays off; only the confirmed review releases it', async () => {
    const t = setup(server);
    t.change('a');
    t.controller.setEnabled(true);
    await settle(t);
    t.calls.length = 0;
    vi.setSystemTime(START + STALE_DEVICE_MS + 1000);
    t.controller.refresh();
    expect(t.controller.getSnapshot().phase).toBe('needs_review');
    t.change('b');
    setVisibility('visible');
    await advance(t, DEBOUNCE_MS * 3);
    expect(t.calls).toHaveLength(0);
    // turning sync off and on, a manual run and a reconnect do not release it either
    t.controller.setEnabled(false);
    t.controller.setEnabled(true);
    t.controller.request('manual');
    t.controller.notifyConnected();
    await settle(t);
    expect(t.calls).toHaveLength(0);
    expect(t.controller.getSnapshot().phase).toBe('needs_review');
    expect('resumeAfterReview' in t.controller).toBe(false);

    // reading the plan changes nothing
    const plan = await t.controller.prepareReview();
    expect(t.controller.getSnapshot().phase).toBe('needs_review');
    expect(t.puts()).toBe(0);
    // confirming releases it and syncs once
    t.controller.applyReview(plan);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('idle');
    expect(t.puts()).toBe(1);
  });

  it('not connected: shown as such and nothing is sent; the device name is saved sanitised', async () => {
    const t = setup(server);
    t.storage.removeItem('animan.lifehub.tokens.v1');
    t.controller.setEnabled(true);
    await settle(t);
    expect(t.controller.getSnapshot().phase).toBe('not_connected');
    expect(t.calls).toHaveLength(0);
    t.controller.setDeviceLabel('  내 폰 Pixel  ');
    expect(t.controller.getSnapshot().customLabel).toBe('Pixel');
    t.controller.setDeviceLabel('한글');
    expect(t.controller.getSnapshot()).toMatchObject({ customLabel: null, effectiveLabel: 'Chrome on Linux' });
  });

  it('turning it off stops everything that was scheduled', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: true });
    const stop = t.controller.start();
    await settle(t);
    t.calls.length = 0;
    t.change('a');
    t.controller.setEnabled(false);
    await advance(t, DEBOUNCE_MS * 3);
    expect(t.calls).toHaveLength(0);
    expect(t.controller.getSnapshot().phase).toBe('off');
    stop();
  });

  it('start() is idempotent (React StrictMode runs effects twice)', async () => {
    const t = setup(server);
    updateState(t.storage, { enabled: true });
    const stop1 = t.controller.start();
    const stop2 = t.controller.start();
    expect(stop1).toBe(stop2);
    await settle(t);
    expect(t.calls.filter((c) => c.endsWith('/meta'))).toHaveLength(1);
    stop1();
  });
});
