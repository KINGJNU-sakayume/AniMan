import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeProgressV2 } from '../lib/progress/merge';
import { completedMap, type ProgressV2 } from '../lib/progress/model';
import { createFakeSyncServer, sha256OfText, type FakeResponse, type FakeSyncServer } from '../test/fakeSyncServer';
import { LIFEHUB_ORIGIN, type Deps } from './remote';
import {
  defaultDeviceLabel, fetchServerDocument, MAX_ATTEMPTS, readState, runSync, sanitizeDeviceLabel, STALE_DEVICE_MS, updateState,
  type SyncHost, type SyncOutcome,
} from './sync';

// 합성 데이터만 쓴다. 실제 Life Hub 에는 요청을 보내지 않는다(fetch 는 전부 가짜 서버로).
const API = LIFEHUB_ORIGIN + '/animan/v1';
const TOKENS_KEY = 'animan.lifehub.tokens.v1';
const START = Date.UTC(2026, 10, 3, 9, 0, 0);

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const at = (n: number) => new Date(START + n * 1000).toISOString();
const done = (n: number) => ({ done: true, at: at(n) });
const gone = (n: number) => ({ done: false, at: at(n) });

interface Call { method: string; path: string; headers: Record<string, string>; body?: string }
type Intercept = (call: Call, forward: () => Promise<FakeResponse>) => Promise<FakeResponse>;

function makeDevice(server: FakeSyncServer, options: {
  scope?: string | null; label?: string | null; intercept?: Intercept; progress?: ProgressV2; clock?: { now: number };
} = {}) {
  const storage = memory();
  const clock = options.clock ?? { now: START };
  const scope = options.scope === undefined ? 'animan:inbox animan:sync' : options.scope;
  storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', access_expires_at: 10 ** 13, ...(scope === null ? {} : { scope }) }));
  const calls: Call[] = [];
  const state = { progress: options.progress ?? ({} as ProgressV2), intercept: options.intercept };
  const tokenRequests: string[] = [];
  const deps: Deps = {
    storage, session: memory(), now: () => clock.now,
    random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        tokenRequests.push(String(init?.body));
        return new Response(JSON.stringify({ access_token: 'at-2', refresh_token: 'rt-2', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
      }
      const call: Call = {
        method: init?.method ?? 'GET', path: url.slice(API.length), headers: { ...(init?.headers as Record<string, string>) }, body: init?.body as string | undefined,
      };
      calls.push(call);
      const forward = () => server.handle(call);
      const res = state.intercept ? await state.intercept(call, forward) : await forward();
      return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
    }) as typeof fetch,
  };
  const host: SyncHost = {
    snapshot: () => state.progress,
    applyRemote: (remote) => (state.progress = mergeProgressV2(state.progress, remote)),
  };
  const run = (): Promise<SyncOutcome> => runSync(deps, host, options.label === undefined ? 'Test Browser' : options.label);
  return { deps, host, storage, calls, state, clock, run, tokenRequests, puts: () => calls.filter((c) => c.method === 'PUT') };
}

const lostResponse = () => Promise.reject(new TypeError('network down'));

let server: FakeSyncServer;
beforeEach(() => {
  localStorage.clear();
  server = createFakeSyncServer({ now: () => START + 500 });
});

describe('first write and pulls', () => {
  it('meta 404 → one PUT with If-None-Match: * and the device label; records the version it wrote', async () => {
    const a = makeDevice(server, { progress: { s: { x: done(1) } } });
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /sync/meta', 'PUT /sync']);
    const put = a.puts()[0];
    expect(put.headers['If-None-Match']).toBe('*');
    expect(put.headers['If-Match']).toBeUndefined();
    expect(put.headers['X-Device-Label']).toBe('Test Browser');
    expect(put.headers.Authorization).toBe('Bearer at-1');
    const doc = JSON.parse(put.body!);
    expect(doc).toMatchObject({ app: 'animan', version: 2, progress: { s: { x: done(1) } } });
    expect(readState(a.storage)).toMatchObject({ version: 1, lastSyncAt: START, halt: null });
    expect(server.current()?.device).toBe('Test Browser');
  });

  it('the hash covers the exact UTF-8 bytes of the string that was sent (Hangul ids included)', async () => {
    const a = makeDevice(server, { progress: { '작품-가나다': { '화-1': done(1) } } });
    await a.run();
    const sent = a.puts()[0].body!;
    expect(server.current()!.body).toBe(sent);
    expect(server.current()!.sha256).toBe(await sha256OfText(sent));
    expect(new TextEncoder().encode(sent).byteLength).toBeGreaterThan(sent.length);
  });

  it('another device pulls, merges, and writes nothing when the merge equals the server document', async () => {
    const a = makeDevice(server, { progress: { s: { x: done(1) } } });
    await a.run();
    const b = makeDevice(server, { progress: { s: { x: done(1) } } });
    expect(await b.run()).toEqual({ kind: 'ok', version: 1 });
    expect(b.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /sync/meta', 'GET /sync']);

    const c = makeDevice(server);
    expect(await c.run()).toMatchObject({ kind: 'ok' });
    expect(c.state.progress).toEqual({ s: { x: done(1) } });
    expect(c.puts()).toHaveLength(0);
  });

  it('nothing new and nothing unsent: a single cheap meta request', async () => {
    const a = makeDevice(server, { progress: { s: { x: done(1) } } });
    await a.run();
    a.calls.length = 0;
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /sync/meta']);
  });

  it('pushes a local change with If-Match "<last version>" (quoted) and the server version goes up by one', async () => {
    const a = makeDevice(server, { progress: { s: { x: done(1) } } });
    await a.run();
    a.state.progress = { s: { x: done(1), y: done(2) } };
    a.calls.length = 0;
    expect(await a.run()).toEqual({ kind: 'ok', version: 2 });
    expect(a.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /sync/meta', 'GET /sync', 'PUT /sync']);
    expect(a.puts()[0].headers['If-Match']).toBe('"1"');
    expect(a.puts()[0].headers['If-None-Match']).toBeUndefined();
    expect(server.document()!.progress).toEqual({ s: { x: done(1), y: done(2) } });
  });

  it('uses the server written_at as the floor for later timestamps', async () => {
    const a = makeDevice(server, { progress: { s: { x: done(1) } } });
    await a.run();
    expect(Number(localStorage.getItem('animan:progress:clock-floor:v1'))).toBe(START + 500);
  });
});

describe('convergence', () => {
  it('two devices that each changed something offline end up with the same record, in either order', async () => {
    for (const order of ['ab', 'ba'] as const) {
      localStorage.clear();
      server = createFakeSyncServer({ now: () => START + 500 });
      const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
      const b = makeDevice(server, { progress: { s: { b1: done(2) }, t: { t1: done(3) } } });
      const devices = { a, b };
      for (const id of order) await devices[id as 'a' | 'b'].run();
      for (const d of [a, b, a, b]) await d.run();
      expect(a.state.progress).toEqual(b.state.progress);
      expect(a.state.progress).toEqual({ s: { a1: done(1), b1: done(2) }, t: { t1: done(3) } });
      expect(server.document()!.progress).toEqual(a.state.progress);
    }
  });

  it('an un-check made later on device B wins on both devices, whichever device syncs first', async () => {
    for (const first of ['a', 'b'] as const) {
      localStorage.clear();
      server = createFakeSyncServer({ now: () => START + 500 });
      const a = makeDevice(server, { progress: { s: { x: done(1) } } });
      await a.run();
      const b = makeDevice(server);
      await b.run(); // B pulls the check
      expect(completedMap(b.state.progress)).toEqual({ s: ['x'] });
      b.state.progress = { s: { x: gone(10) } }; // B un-checks later
      a.state.progress = { s: { x: done(5) } }; // A re-saves the check earlier than B's un-check
      const order = first === 'a' ? [a, b, a, b] : [b, a, b, a];
      for (const d of order) await d.run();
      expect(a.state.progress).toEqual({ s: { x: gone(10) } });
      expect(b.state.progress).toEqual({ s: { x: gone(10) } });
      expect(completedMap(a.state.progress)).toEqual({});
    }
  });

  it('a check that is newer than another device\'s un-check wins everywhere', async () => {
    const a = makeDevice(server, { progress: { s: { x: gone(1) } } });
    await a.run();
    const b = makeDevice(server, { progress: { s: { x: done(2) } } });
    await b.run();
    await a.run();
    expect(a.state.progress).toEqual({ s: { x: done(2) } });
  });

  it('two devices syncing at the same moment never lose an update (412 → re-merge → retry)', async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let n = 0; // a fixed pattern of delays so the interleaving is the same on every run
    const slow: Intercept = async (_call, forward) => {
      await delay((n++ * 7) % 4);
      return forward();
    };
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, intercept: slow });
    const b = makeDevice(server, { progress: { s: { b1: done(2) } }, intercept: slow });
    const c = makeDevice(server, { progress: { s: { c1: done(3) } }, intercept: slow });
    const first = await Promise.all([a.run(), b.run(), c.run()]);
    for (const outcome of first) expect(['ok', 'retry']).toContain(outcome.kind);
    for (let i = 0; i < 3; i++) await Promise.all([a.run(), b.run(), c.run()]);
    expect(server.document()!.progress).toEqual({ s: { a1: done(1), b1: done(2), c1: done(3) } });
    expect(a.state.progress).toEqual(server.document()!.progress);
    expect(b.state.progress).toEqual(server.document()!.progress);
    expect(c.state.progress).toEqual(server.document()!.progress);
    expect(server.versions.map((v) => v.version)).toEqual([...server.versions.map((v) => v.version)].sort((x, y) => x - y));
  });
});

describe('412 handling', () => {
  it('re-reads, re-merges and retries once the other writer is merged in', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    await a.run();
    const rival = makeDevice(server);
    await rival.run();
    rival.state.progress = { s: { a1: done(1), r1: done(4) } };
    a.state.progress = { s: { a1: done(1), a2: done(2) } };
    let raced = false;
    a.state.intercept = async (call, forward) => {
      // The rival writes between A's GET and A's PUT.
      if (call.method === 'PUT' && !raced) {
        raced = true;
        await rival.run();
      }
      return forward();
    };
    a.calls.length = 0;
    expect(await a.run()).toMatchObject({ kind: 'ok' });
    expect(a.puts()).toHaveLength(2);
    expect(a.puts()[0].headers['If-Match']).toBe('"1"');
    expect(a.puts()[1].headers['If-Match']).toBe('"2"');
    expect(server.document()!.progress).toEqual({ s: { a1: done(1), a2: done(2), r1: done(4) } });
    expect(a.state.progress).toEqual(server.document()!.progress);
  });

  it(`gives up after ${MAX_ATTEMPTS} PUTs: keeps local data and reports "retry later"`, async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    await a.run();
    let n = 0;
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT') {
        // Someone else always gets in first.
        const v = server.current()!;
        const doc = JSON.parse(v.body);
        doc.progress.s[`other${++n}`] = done(10 + n);
        const body = JSON.stringify(doc);
        await server.handle({ method: 'PUT', path: '/sync', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json', 'If-Match': `"${v.version}"` }, body });
      }
      return forward();
    };
    a.state.progress = { s: { a1: done(1), mine: done(2) } };
    a.calls.length = 0;
    expect(await a.run()).toEqual({ kind: 'retry' });
    expect(a.puts()).toHaveLength(MAX_ATTEMPTS);
    // Local keeps its own change (and has merged what it read), and the version we last wrote is unchanged.
    expect(a.state.progress.s.mine).toEqual(done(2));
    expect(readState(a.storage).version).toBe(1);
  });

  it('treats a 412 whose current.sha256 equals the hash of what was just sent as success (replay of a committed write)', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT') await forward(); // the first copy commits…
      return forward(); // …the replay gets 412 with current = our own write
    };
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.puts()).toHaveLength(1);
    expect(server.versions).toHaveLength(1);
    expect(server.log.filter((l) => l.status === 412)).toHaveLength(1);
    expect(readState(a.storage).version).toBe(1);
  });

  it('current: null (document deleted) → write again with If-None-Match: *', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    await a.run();
    a.state.progress = { s: { a1: done(1), a2: done(2) } };
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT' && call.headers['If-Match']) server.versions.length = 0; // deleted behind our back
      return forward();
    };
    a.calls.length = 0;
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    const puts = a.puts();
    expect(puts.map((p) => p.headers['If-Match'] ?? p.headers['If-None-Match'])).toEqual(['"1"', '*']);
    expect(server.document()!.progress).toEqual({ s: { a1: done(1), a2: done(2) } });
  });
});

describe('a PUT whose response never arrived', () => {
  it('is not sent twice when /sync/meta shows our hash (the write landed)', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT') {
        await forward();
        return lostResponse();
      }
      return forward();
    };
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.puts()).toHaveLength(1);
    expect(server.versions).toHaveLength(1);
    expect(a.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /sync/meta', 'PUT /sync', 'GET /sync/meta']);
  });

  it('also holds when the lost answer was a 5xx', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT') {
        await forward();
        return { status: 502, headers: {}, body: '<html>bad gateway</html>' };
      }
      return forward();
    };
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(server.versions).toHaveLength(1);
  });

  it('is sent again when meta shows it did not land', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    let first = true;
    a.state.intercept = async (call, forward) => {
      if (call.method === 'PUT' && first) {
        first = false;
        return lostResponse();
      }
      return forward();
    };
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.puts()).toHaveLength(2);
    expect(server.versions).toHaveLength(1);
  });

  it('is not blindly resent when meta cannot be read either; the next pass finds the write already there', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    let phase = 0;
    a.state.intercept = async (call, forward) => {
      if (phase === 0 && call.method === 'PUT') {
        phase = 1;
        await forward();
        return lostResponse();
      }
      if (phase === 1) return lostResponse(); // the verifying meta request fails as well
      return forward();
    };
    expect(await a.run()).toEqual({ kind: 'retry' });
    expect(a.puts()).toHaveLength(1);
    phase = 2;
    a.calls.length = 0;
    expect(await a.run()).toEqual({ kind: 'ok', version: 1 });
    expect(a.puts()).toHaveLength(0);
    expect(server.versions).toHaveLength(1);
  });
});

describe('failures that must not touch local data', () => {
  const failing = (status: number, body = '{"error":"x"}'): Intercept => async () => ({ status, headers: { 'Content-Type': 'application/json' }, body });
  const failPuts = (status: number): Intercept => async (call, forward) => (call.method === 'PUT' ? failing(status)(call, forward) : forward());

  it('413: reported as too large, one PUT, local data untouched, nothing looped', async () => {
    const small = createFakeSyncServer({ maxBytes: 50 });
    const a = makeDevice(small, { progress: { s: { a1: done(1) } } });
    const before = a.state.progress;
    expect(await a.run()).toEqual({ kind: 'too_large' });
    expect(a.puts()).toHaveLength(1);
    expect(a.state.progress).toEqual(before); // nothing on the server, so the merge changed nothing
    expect(small.versions).toHaveLength(0);
    expect(readState(a.storage).version).toBeNull();
  });

  it.each([400, 415, 428])('%i is a client bug: "error" outcome, not retried', async (status) => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, intercept: failPuts(status) });
    expect(await a.run()).toEqual({ kind: 'error', status });
    expect(a.puts()).toHaveLength(1);
  });

  it('network failure on the first request: retry later, local data untouched', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, intercept: lostResponse });
    const before = a.state.progress;
    expect(await a.run()).toEqual({ kind: 'retry' });
    expect(a.state.progress).toBe(before);
    expect(a.calls).toHaveLength(1);
  });

  it.each([500, 502, 503, 429])('%i while reading: retry later, local data untouched', async (status) => {
    const seeded = makeDevice(server, { progress: { s: { x: done(1) } } });
    await seeded.run();
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, intercept: failing(status) });
    const before = a.state.progress;
    expect(await a.run()).toEqual({ kind: 'retry' });
    expect(a.state.progress).toBe(before);
  });

  it('a garbled success response is a retry, not a crash', async () => {
    const a = makeDevice(server, { intercept: async () => ({ status: 200, headers: {}, body: '<html>captive portal</html>' }) });
    expect(await a.run()).toEqual({ kind: 'retry' });
  });

  it('a server document in an unknown format is never merged into or overwritten', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    a.state.intercept = async (call, forward) => {
      if (call.path === '/sync/meta') return { status: 200, headers: {}, body: JSON.stringify({ version: 7, sha256: 'ab'.repeat(32), written_at: at(1) }) };
      if (call.method === 'GET') return { status: 200, headers: {}, body: JSON.stringify({ version: 7, sha256: 'ab'.repeat(32), written_at: at(1), doc: { app: 'animan', version: 3, progress: {} } }) };
      return forward();
    };
    const before = a.state.progress;
    expect(await a.run()).toEqual({ kind: 'error', status: null });
    expect(a.puts()).toHaveLength(0);
    expect(a.state.progress).toBe(before);
  });

  it('outcomes and thrown errors carry no document text, token or response body', async () => {
    const secret = 'SECRET-BODY-TEXT';
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, intercept: async (call, forward) => (call.method === 'PUT' ? { status: 400, headers: {}, body: JSON.stringify({ error: secret }) } : forward()) });
    const outcome = await a.run();
    expect(JSON.stringify(outcome)).not.toMatch(/SECRET|at-1|rt-1|a1/);
  });
});

describe('permissions and tokens', () => {
  it('403 insufficient_scope keeps the token and reports "no permission" (the inbox keeps working)', async () => {
    server.state.syncScope = false;
    const a = makeDevice(server, { scope: null, progress: { s: { a1: done(1) } } });
    expect(await a.run()).toEqual({ kind: 'no_permission' });
    expect(JSON.parse(a.storage.getItem(TOKENS_KEY)!)).toMatchObject({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(a.calls).toHaveLength(1);
  });

  it('a token known to lack the sync scope does not even try', async () => {
    const a = makeDevice(server, { scope: 'animan:inbox', progress: { s: { a1: done(1) } } });
    expect(await a.run()).toEqual({ kind: 'no_permission' });
    expect(a.calls).toHaveLength(0);
    expect(a.storage.getItem(TOKENS_KEY)).not.toBeNull();
  });

  it('any other 403 means the grant is unusable: the token is dropped', async () => {
    const a = makeDevice(server, { intercept: async () => ({ status: 403, headers: { 'Content-Type': 'application/json' }, body: '{"error":"Forbidden"}' }) });
    expect(await a.run()).toEqual({ kind: 'not_connected' });
    expect(a.storage.getItem(TOKENS_KEY)).toBeNull();
  });

  it('401 refreshes the token once and retries; a second 401 drops the token', async () => {
    let first = true;
    const a = makeDevice(server, {
      progress: { s: { a1: done(1) } },
      intercept: async (_call, forward) => {
        if (first) {
          first = false;
          return { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' }, body: '{}' };
        }
        return forward();
      },
    });
    expect(await a.run()).toMatchObject({ kind: 'ok' });
    expect(a.tokenRequests).toHaveLength(1);
    expect(a.calls[0].headers.Authorization).toBe('Bearer at-1');
    expect(a.calls[1].headers.Authorization).toBe('Bearer at-2');

    const b = makeDevice(server, { intercept: async () => ({ status: 401, headers: {}, body: '{}' }) });
    expect(await b.run()).toEqual({ kind: 'not_connected' });
    expect(b.storage.getItem(TOKENS_KEY)).toBeNull();
    expect(b.tokenRequests).toHaveLength(1);
  });

  it('the refreshed token keeps the scope the grant was known to carry', async () => {
    const a = makeDevice(server, { scope: 'animan:inbox animan:sync' });
    a.state.intercept = async (call, forward) => {
      if (call.headers.Authorization === 'Bearer at-1') return { status: 401, headers: {}, body: '{}' };
      return forward();
    };
    await a.run();
    expect(JSON.parse(a.storage.getItem(TOKENS_KEY)!).scope).toBe('animan:inbox animan:sync');
  });
});

describe('180-day rule', () => {
  it('a device whose last successful sync is older than 180 days sends nothing and asks for a manual review', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    await a.run();
    updateState(a.storage, { lastSyncAt: START - STALE_DEVICE_MS - 1 });
    a.calls.length = 0;
    const before = a.state.progress;
    expect(await a.run()).toEqual({ kind: 'needs_review' });
    expect(a.calls).toHaveLength(0);
    expect(a.state.progress).toBe(before);
  });

  it('exactly 180 days is still fine, and a device that never synced is not "stale"', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    updateState(a.storage, { lastSyncAt: START - STALE_DEVICE_MS });
    expect(await a.run()).toMatchObject({ kind: 'ok' });
    const b = makeDevice(server);
    expect(readState(b.storage).lastSyncAt).toBeNull();
    expect(await b.run()).toMatchObject({ kind: 'ok' });
  });

  it('the server document can still be fetched for the manual import preview, without touching local data', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } } });
    await a.run();
    const old = makeDevice(server, { progress: { s: { mine: done(2) } } });
    const before = old.state.progress;
    await expect(fetchServerDocument(old.deps)).resolves.toEqual({ progress: { s: { a1: done(1) } }, writtenAt: new Date(START + 500).toISOString() });
    expect(old.state.progress).toBe(before);
    const empty = makeDevice(createFakeSyncServer());
    await expect(fetchServerDocument(empty.deps)).resolves.toBeNull();
  });
});

describe('tombstone pruning on write', () => {
  it('the PUT leaves out tombstones older than 180 days, but the merge itself kept them until then', async () => {
    const day = 86_400_000;
    const ancient = { done: false, at: new Date(START - 200 * day).toISOString() };
    const recent = { done: false, at: new Date(START - 5 * day).toISOString() };
    const a = makeDevice(server, { progress: { s: { ancient, recent, live: done(1) } } });
    await a.run();
    expect(server.document()!.progress).toEqual({ s: { recent, live: done(1) } });
  });
});

describe('device label', () => {
  it('is sanitised: printable ASCII only, trimmed, at most 40 characters', () => {
    expect(sanitizeDeviceLabel('  My Phone  ')).toBe('My Phone');
    expect(sanitizeDeviceLabel('내 폰')).toBeNull();
    expect(sanitizeDeviceLabel('폰 Pixel 8')).toBe('Pixel 8');
    expect(sanitizeDeviceLabel('   ')).toBeNull();
    expect(sanitizeDeviceLabel('')).toBeNull();
    expect(sanitizeDeviceLabel('x'.repeat(60))).toHaveLength(40);
    expect(sanitizeDeviceLabel('a\u0000b\tc')).toBe('abc');
    expect(sanitizeDeviceLabel(`${'y'.repeat(39)} z`)).toBe('y'.repeat(39));
  });

  it('is left out of the request when nothing printable remains (the server answers 400 for an empty one)', async () => {
    const a = makeDevice(server, { progress: { s: { a1: done(1) } }, label: '한글만' });
    expect(await a.run()).toMatchObject({ kind: 'ok' });
    expect(a.puts()[0].headers['X-Device-Label']).toBeUndefined();
    const b = makeDevice(createFakeSyncServer(), { progress: { s: { a1: done(1) } }, label: null });
    expect(await b.run()).toMatchObject({ kind: 'ok' });
    expect(b.puts()[0].headers['X-Device-Label']).toBeUndefined();
  });

  it('has a short default made from the browser and OS', () => {
    expect(defaultDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(defaultDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(defaultDeviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(defaultDeviceLabel('')).toBe('Browser');
  });
});

describe('sync state', () => {
  it('tolerates a corrupted state value', () => {
    const storage = memory();
    storage.setItem('animan.sync.state.v1', '{nope');
    expect(readState(storage)).toMatchObject({ enabled: false, version: null, halt: null });
    vi.useRealTimers();
  });
});
