import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCatalog, sampleProgress } from '../lib/board/sampleState';
import type { ProgressV2 } from '../lib/progress/model';
import {
  BOARD_STATE_KEY, createBoardUploader, createMergedGate, DAILY_MS, manifestHash, MIN_INTERVAL_MS, readBoardState,
} from './boardUpload';
import { LIFEHUB_ORIGIN, type Deps } from './remote';

// 합성 데이터와 가짜 fetch 만 쓴다. 시간은 직접 흘린다(타이머도 가로채 기록한다).
const BOARD_URL = LIFEHUB_ORIGIN + '/animan/v1/board';
const TOKENS_KEY = 'animan.lifehub.tokens.v1';
const START = Date.UTC(2026, 10, 7, 3, 0, 0);
const MIN = 60_000;

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const insufficient = () => reply(403, { error: 'insufficient_scope' }, { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="animan:board"' });

interface Harness {
  deps: Deps;
  clock: { t: number };
  puts: Array<{ headers: Record<string, string>; body: string }>;
  respond: { fn: (n: number) => Response | 'network' };
  progress: { value: ProgressV2 };
  timers: Array<{ fn: () => void; ms: number; cancelled: boolean }>;
  state: { ready: boolean; notConnected: number; reconnect: boolean[] };
  uploader: ReturnType<typeof createBoardUploader>;
  remake: () => Harness['uploader'];
}

function setup(options: { scope?: string; connected?: boolean; storage?: ReturnType<typeof memory>; progress?: ProgressV2 } = {}): Harness {
  const storage = options.storage ?? memory();
  if (options.connected !== false && !storage.getItem(TOKENS_KEY))
    storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: 10 ** 13, ...(options.scope === undefined ? {} : { scope: options.scope }) }));
  const clock = { t: START };
  const puts: Harness['puts'] = [];
  const respond: Harness['respond'] = { fn: () => reply(200, { ok: true }) };
  const progress = { value: options.progress ?? sampleProgress };
  const timers: Harness['timers'] = [];
  const state: Harness['state'] = { ready: true, notConnected: 0, reconnect: [] };
  const deps: Deps = {
    storage, session: memory(), now: () => clock.t, random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth/token'))
        return reply(200, { access_token: 'at2', refresh_token: 'rt2', token_type: 'Bearer', expires_in: 3600 });
      expect(url).toBe(BOARD_URL);
      expect(init?.method).toBe('PUT');
      puts.push({ headers: init?.headers as Record<string, string>, body: String(init?.body) });
      const r = respond.fn(puts.length);
      if (r === 'network') throw new TypeError('offline');
      return r;
    }) as typeof fetch,
  };
  const h = { deps, clock, puts, respond, progress, timers, state } as Harness;
  const make = () => createBoardUploader({
    deps, getProgress: () => progress.value, getCatalog: () => sampleCatalog, ready: () => state.ready,
    onState: (s) => state.reconnect.push(s.needsReconnect), onNotConnected: () => void state.notConnected++,
    setTimer: (fn, ms) => {
      const t = { fn: () => { t.cancelled = true; fn(); }, ms, cancelled: false };
      timers.push(t);
      return () => void (t.cancelled = true);
    },
  });
  h.uploader = make();
  h.remake = () => (h.uploader = make());
  return h;
}
const live = (h: Harness) => h.timers.filter((t) => !t.cancelled);
const tokenKept = (h: Harness) => h.deps.storage.getItem(TOKENS_KEY) !== null;

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errors.mockRestore());

describe('upload', () => {
  it('PUTs the manifest to /animan/v1/board with the bearer token and remembers the result', async () => {
    const h = setup();
    expect(await h.uploader.attempt()).toBe('sent');
    expect(h.puts).toHaveLength(1);
    expect(h.puts[0].headers).toMatchObject({ Authorization: 'Bearer at', 'Content-Type': 'application/json' });
    const body = JSON.parse(h.puts[0].body);
    expect(body).toMatchObject({ version: 1, app: 'animan', generated_at: new Date(START).toISOString() });
    expect(body.tiles.map((t: { id: string }) => t.id)).toEqual(['now', 'done', 'next']);
    const saved = readBoardState(h.deps.storage);
    expect(saved).toMatchObject({ lastOkAt: START, lastSentAt: START, pending: false, halt: null });
    expect(saved.sha).toBe(await manifestHash(body, h.deps.sha256));
  });

  it('treats { unchanged: true } and { ignored: true } as success', async () => {
    for (const [body, result] of [[{ unchanged: true }, 'sent'], [{ ignored: true }, 'ignored']] as const) {
      const h = setup();
      h.respond.fn = () => reply(200, body);
      expect(await h.uploader.attempt()).toBe(result);
      expect(readBoardState(h.deps.storage)).toMatchObject({ lastOkAt: START, pending: false });
      expect(h.timers).toHaveLength(0);
      expect(errors).not.toHaveBeenCalled();
    }
  });

  it('does not upload when not connected, not synced yet, or when there are no records', async () => {
    const off = setup({ connected: false });
    expect(await off.uploader.attempt()).toBe('skipped');
    const waiting = setup();
    waiting.state.ready = false;
    expect(await waiting.uploader.attempt()).toBe('skipped');
    const empty = setup({ progress: {} });
    expect(await empty.uploader.attempt()).toBe('skipped');
    const onlyTombstones = setup({ progress: { s: { a: { done: false, at: '2026-11-05T00:00:00.000Z' } } } });
    expect(await onlyTombstones.uploader.attempt()).toBe('skipped');
    for (const h of [off, waiting, empty, onlyTombstones]) {
      expect(h.puts).toHaveLength(0);
      expect(readBoardState(h.deps.storage).sha).toBeNull();
    }
    waiting.state.ready = true; // 동기화가 합친 뒤에는 올린다
    expect(await waiting.uploader.attempt()).toBe('sent');
  });
});

describe('permission and token handling', () => {
  it('insufficient_scope keeps the token, stops automatic uploads and asks to reconnect', async () => {
    const h = setup({ scope: 'animan:inbox animan:sync' });
    h.respond.fn = () => insufficient();
    expect(await h.uploader.attempt()).toBe('no_scope');
    expect(tokenKept(h)).toBe(true);
    expect(h.state.notConnected).toBe(0);
    expect(h.uploader.needsReconnect()).toBe(true);
    expect(h.state.reconnect).toEqual([true]);
    expect(readBoardState(h.deps.storage)).toMatchObject({ halt: 'no_scope', pending: true });
    // 멈춘 동안에는 요청을 다시 보내지 않는다
    h.uploader.notifyChange();
    expect(await h.uploader.attempt()).toBe('no_scope');
    expect(h.puts).toHaveLength(1);
  });

  it('after reconnecting (new token with the board scope) uploads resume', async () => {
    const h = setup({ scope: 'animan:inbox animan:sync' });
    h.respond.fn = () => insufficient();
    await h.uploader.attempt();
    h.deps.storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'new', refresh_token: 'rt', access_expires_at: 10 ** 13, scope: 'animan:inbox animan:sync animan:board' }));
    h.respond.fn = () => reply(200, { ok: true });
    h.clock.t += MIN_INTERVAL_MS;
    expect(await h.uploader.attempt()).toBe('sent');
    expect(h.uploader.needsReconnect()).toBe(false);
    expect(h.state.reconnect).toEqual([true, false]);
  });

  it('any other 403 follows the existing rule: the token is dropped', async () => {
    const h = setup();
    h.respond.fn = () => reply(403, { error: 'forbidden' });
    expect(await h.uploader.attempt()).toBe('not_connected');
    expect(tokenKept(h)).toBe(false);
    expect(h.state.notConnected).toBe(1);
  });

  it('a 403 with a WWW-Authenticate for something else is not insufficient_scope', async () => {
    const h = setup();
    h.respond.fn = () => reply(403, {}, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
    expect(await h.uploader.attempt()).toBe('not_connected');
    expect(tokenKept(h)).toBe(false);
  });

  it('a 401 is retried once with a refreshed token; if it persists the token is dropped', async () => {
    const ok = setup();
    ok.respond.fn = (n) => (n === 1 ? reply(401) : reply(200, { ok: true }));
    expect(await ok.uploader.attempt()).toBe('sent');
    expect(ok.puts.map((p) => p.headers.Authorization)).toEqual(['Bearer at', 'Bearer at2']);
    expect(tokenKept(ok)).toBe(true);

    const bad = setup();
    bad.respond.fn = () => reply(401);
    expect(await bad.uploader.attempt()).toBe('not_connected');
    expect(bad.puts).toHaveLength(2);
    expect(tokenKept(bad)).toBe(false);
  });
});

describe('failures', () => {
  it('400 and 413 are logged, not retried with the same content, and the token stays', async () => {
    for (const status of [400, 413]) {
      const h = setup();
      h.respond.fn = () => reply(status, { error: 'bad' });
      expect(await h.uploader.attempt()).toBe('rejected');
      expect(errors).toHaveBeenCalled();
      expect(tokenKept(h)).toBe(true);
      expect(h.timers).toHaveLength(0);
      h.clock.t += 3 * DAILY_MS;
      expect(await h.uploader.start()).toBe('rejected'); // 하루가 지나도 같은 내용은 다시 보내지 않는다
      expect(h.puts).toHaveLength(1);
      // 내용이 바뀌면 새로 보낸다
      h.respond.fn = () => reply(200, { ok: true });
      h.progress.value = { ...sampleProgress, 'sample-d': { 'sample-d-e1': { done: true, at: '2026-11-07T01:00:00.000Z' } } };
      expect(await h.uploader.attempt()).toBe('sent');
      expect(h.puts).toHaveLength(2);
      errors.mockClear();
    }
  });

  it('network errors and 5xx keep the pending mark, keep the token, and try again no sooner than 10 minutes', async () => {
    for (const failure of ['network', reply(503)] as const) {
      const h = setup();
      h.respond.fn = () => failure === 'network' ? 'network' : reply(503);
      expect(await h.uploader.attempt()).toBe('retry');
      expect(tokenKept(h)).toBe(true);
      expect(readBoardState(h.deps.storage)).toMatchObject({ pending: true, sha: null, lastOkAt: null });
      expect(live(h).map((t) => t.ms)).toEqual([MIN_INTERVAL_MS]);
      h.respond.fn = () => reply(200, { ok: true });
      h.clock.t += MIN_INTERVAL_MS;
      live(h)[0].fn();
      await vi.waitFor(() => expect(h.puts).toHaveLength(2));
    }
  });
});

describe('frequency', () => {
  it('at most once per 10 minutes: a change inside the window waits for the window and goes out once', async () => {
    const h = setup();
    await h.uploader.attempt();
    expect(h.puts).toHaveLength(1);
    h.clock.t += 3 * MIN;
    h.progress.value = { ...sampleProgress, 'sample-d': { 'sample-d-e1': { done: true, at: '2026-11-07T01:00:00.000Z' } } };
    expect(await h.uploader.attempt()).toBe('throttled');
    h.progress.value = { ...sampleProgress, 'sample-d': { 'sample-d-e1': { done: true, at: '2026-11-07T02:00:00.000Z' } } };
    expect(await h.uploader.attempt()).toBe('throttled'); // 또 바뀌어도 타이머는 하나
    expect(h.puts).toHaveLength(1);
    expect(live(h)).toHaveLength(1);
    expect(live(h)[0].ms).toBe(7 * MIN);
    expect(readBoardState(h.deps.storage).pending).toBe(true);
    h.clock.t += 7 * MIN;
    live(h)[0].fn();
    await vi.waitFor(() => expect(h.puts).toHaveLength(2));
    expect(readBoardState(h.deps.storage)).toMatchObject({ pending: false, lastSentAt: h.clock.t });
    expect(live(h)).toHaveLength(0);
  });

  it('a change after the window has passed goes out right away', async () => {
    const h = setup();
    await h.uploader.attempt();
    h.clock.t += 10 * MIN;
    h.progress.value = { ...sampleProgress, 'sample-d': { 'sample-d-e1': { done: true, at: '2026-11-07T01:00:00.000Z' } } };
    h.uploader.notifyChange();
    await vi.waitFor(() => expect(h.puts).toHaveLength(2));
  });

  it('same content (sha without generated_at) is not sent again', async () => {
    const h = setup();
    await h.uploader.attempt();
    h.clock.t += 5 * MIN; // 시각만 다르고 내용은 같다
    expect(await h.uploader.attempt()).toBe('unchanged');
    h.clock.t += 3 * 60 * MIN;
    expect(await h.uploader.attempt()).toBe('unchanged');
    expect(h.puts).toHaveLength(1);
    expect(readBoardState(h.deps.storage).pending).toBe(false);
  });

  it('on app open, the same content is sent once when the last success is over a day old', async () => {
    const h = setup();
    await h.uploader.attempt();
    h.clock.t += DAILY_MS - MIN;
    expect(await h.uploader.start()).toBe('unchanged');
    expect(h.puts).toHaveLength(1);
    h.clock.t += 2 * MIN;
    expect(await h.uploader.start()).toBe('sent');
    expect(h.puts).toHaveLength(2);
    expect(JSON.parse(h.puts[1].body).generated_at).not.toBe(JSON.parse(h.puts[0].body).generated_at);
    expect(readBoardState(h.deps.storage).lastOkAt).toBe(h.clock.t);
    expect(await h.uploader.start()).toBe('unchanged');
  });

  it('what could not be sent before the app closed goes out when the app opens next (storage survives)', async () => {
    const storage = memory();
    const first = setup({ storage });
    await first.uploader.attempt();
    first.clock.t += 2 * MIN;
    first.progress.value = { ...sampleProgress, 'sample-d': { 'sample-d-e1': { done: true, at: '2026-11-07T01:00:00.000Z' } } };
    first.uploader.notifyChange();
    await vi.waitFor(() => expect(readBoardState(storage).pending).toBe(true));
    expect(first.puts).toHaveLength(1); // 앱이 닫힌다(타이머는 사라짐)

    // 다음 실행: 새 업로더, 같은 localStorage. 10분이 지난 뒤 열었다.
    const next = setup({ storage, progress: first.progress.value });
    next.clock.t = first.clock.t + 20 * MIN;
    expect(readBoardState(storage).pending).toBe(true);
    expect(await next.uploader.start()).toBe('sent');
    expect(next.puts).toHaveLength(1);
    expect(readBoardState(storage).pending).toBe(false);

    // 10분이 안 지났다면 시계가 찰 때까지 기다린다
    const third = setup({ storage, progress: { ...first.progress.value, 'sample-c': { 'sample-c-e9': { done: true, at: '2026-11-07T02:00:00.000Z' } } } });
    third.clock.t = next.clock.t + 4 * MIN;
    expect(await third.uploader.start()).toBe('throttled');
    expect(third.puts).toHaveLength(0);
    expect(live(third)[0].ms).toBe(6 * MIN);
  });

  it('generated_at always moves forward, even if the device clock steps back', async () => {
    const withD = (n: number): ProgressV2 => ({
      ...sampleProgress,
      'sample-d': Object.fromEntries(Array.from({ length: n }, (_, i) => [`sample-d-e${i + 1}`, { done: true, at: '2026-11-07T01:00:00.000Z' }])),
    });
    const h = setup();
    await h.uploader.attempt();
    const stamp = (i: number) => Date.parse(JSON.parse(h.puts[i].body).generated_at);
    h.clock.t = START + 11 * MIN;
    h.progress.value = withD(1);
    await h.uploader.attempt();
    expect(stamp(1)).toBeGreaterThan(stamp(0));
    // 시계가 마지막 generated_at 보다 과거로 돌아갔지만 10분 제한은 지났다고 하자
    h.clock.t = START;
    h.deps.storage.setItem(BOARD_STATE_KEY, JSON.stringify({ ...readBoardState(h.deps.storage), lastSentAt: START - 20 * MIN }));
    h.progress.value = withD(2);
    expect(await h.uploader.attempt()).toBe('sent');
    expect(stamp(2)).toBeGreaterThan(stamp(1));
  });

  it('notifyChange while not connected does nothing', async () => {
    const h = setup({ connected: false });
    h.uploader.notifyChange();
    await Promise.resolve();
    expect(h.puts).toHaveLength(0);
    expect(readBoardState(h.deps.storage).pending).toBe(false);
  });
});

describe('waiting for the device sync to merge first', () => {
  const source = () => {
    const state = { phase: 'syncing', listeners: new Set<(k: string) => void>() };
    return { state, api: { phase: () => state.phase, onPass: (l: (k: string) => void) => { state.listeners.add(l); return () => void state.listeners.delete(l); } } };
  };
  it('is closed while syncing/retrying/needing review, opens after a successful pass', () => {
    const s = source();
    const gate = createMergedGate(s.api);
    for (const phase of ['syncing', 'retry', 'idle', 'needs_review', 'error', 'too_large']) {
      s.state.phase = phase;
      expect(gate.ready(), phase).toBe(false);
    }
    s.state.listeners.forEach((l) => l('retry'));
    expect(gate.ready()).toBe(false);
    s.state.listeners.forEach((l) => l('ok'));
    expect(gate.ready()).toBe(true);
    gate.reset();
    expect(gate.ready()).toBe(false);
  });
  it('is open when sync does not run (no permission / off): this device holds all there is', () => {
    const s = source();
    const gate = createMergedGate(s.api);
    s.state.phase = 'no_permission';
    expect(gate.ready()).toBe(true);
    s.state.phase = 'off';
    expect(gate.ready()).toBe(true);
  });
  it('an upload waits for the gate and goes out once it opens', async () => {
    const s = source();
    const gate = createMergedGate(s.api);
    const h = setup();
    h.state.ready = false;
    const uploader = createBoardUploader({ deps: h.deps, getProgress: () => h.progress.value, getCatalog: () => sampleCatalog, ready: gate.ready });
    expect(await uploader.attempt()).toBe('skipped');
    expect(h.puts).toHaveLength(0);
    s.state.listeners.forEach((l) => l('ok'));
    expect(await uploader.attempt()).toBe('sent');
  });
});
