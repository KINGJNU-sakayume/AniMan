/**
 * Device sync client for AniMan progress over Life Hub (life-hub docs/P6_SYNC.md, sections 5–7).
 *
 * `runSync` is one pass: meta → (GET → merge) → PUT, with the document being the v2 progress map. It owns no
 * timers and no UI; src/lifehub/syncController.ts decides *when* to run it.
 *
 * Rules this file keeps:
 *  - Local data is only ever replaced by "local ∪ server" (`host.applyRemote`). A failed request changes nothing locally.
 *  - Writes are conditional: `If-Match: "<version we last saw>"`, or `If-None-Match: *` for the first write.
 *  - The hash of a write is computed over the exact UTF-8 bytes of the string that was sent (the string is kept).
 *  - 412: our own committed write (current.sha256 equals ours) counts as success; current:null means the document
 *    was deleted, so write again with If-None-Match: *; otherwise GET → re-merge → retry, at most 3 PUTs per pass.
 *  - A PUT whose response never arrived is not re-sent before /sync/meta shows its sha256 is not ours.
 *  - 413 and 400/415/428 are not retried. Network failures and 5xx leave local data alone and are retried later.
 *  - Messages and outcomes carry status codes only, never document text, tokens or response bodies.
 */
import { raiseClockFloor } from '../lib/progress/clock';
import {
  canonicalJson, makeDocV2, progressOfDocV2, pruneTombstones, sameProgress, type ProgressV2,
} from '../lib/progress/model';
import { LifeHubError, mayHaveSyncScope, syncRequest, type Deps } from './remote';

export const STATE_KEY = 'animan.sync.state.v1';
export const MAX_ATTEMPTS = 3;
/** A device that has not synced for longer than this must not auto-merge (tombstones may be gone). */
export const STALE_DEVICE_MS = 180 * 24 * 60 * 60 * 1000;

/* ---------- persisted state ---------- */

/** Why automatic sync stopped until the owner acts. */
export type Halt = 'too_large' | 'no_permission' | 'error';

export interface SyncState {
  enabled: boolean;
  /** The server version this device last saw or wrote. */
  version: number | null;
  /** SHA-256 of the canonical local progress at the last successful sync; a different hash means unsent changes. */
  syncedHash: string | null;
  /** When the last pass succeeded (ms). */
  lastSyncAt: number | null;
  /** The owner's own device name; null = use the default made from the browser and OS. */
  deviceLabel: string | null;
  halt: Halt | null;
}

export const DEFAULT_STATE: SyncState = { enabled: false, version: null, syncedHash: null, lastSyncAt: null, deviceLabel: null, halt: null };

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readState(storage: KV): SyncState {
  try {
    const raw = JSON.parse(storage.getItem(STATE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
    const halt = raw.halt;
    return {
      enabled: raw.enabled === true,
      version: typeof raw.version === 'number' && Number.isInteger(raw.version) && raw.version >= 1 ? raw.version : null,
      syncedHash: typeof raw.syncedHash === 'string' ? raw.syncedHash : null,
      lastSyncAt: typeof raw.lastSyncAt === 'number' && Number.isFinite(raw.lastSyncAt) ? raw.lastSyncAt : null,
      deviceLabel: typeof raw.deviceLabel === 'string' ? raw.deviceLabel : null,
      halt: halt === 'too_large' || halt === 'no_permission' || halt === 'error' ? halt : null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function updateState(storage: KV, patch: Partial<SyncState>): SyncState {
  const next = { ...readState(storage), ...patch };
  try {
    storage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    /* the pass still worked; the next one just re-checks */
  }
  return next;
}

/** True when the last successful sync is older than 180 days. */
export const needsReview = (state: SyncState, nowMs: number): boolean =>
  state.lastSyncAt !== null && nowMs - state.lastSyncAt > STALE_DEVICE_MS;

/* ---------- device label ---------- */

/** Printable ASCII (0x20–0x7E), trimmed, 1–40 chars; null when nothing usable is left (then the header is omitted). */
export function sanitizeDeviceLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const label = value.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 40).trim();
  return label === '' ? null : label;
}

/** A short default such as "Chrome on Windows", from the user-agent string. */
export function defaultDeviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /OPR\/|Opera/.test(userAgent) ? 'Opera' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const os = /iPhone/.test(userAgent) ? 'iPhone' : /iPad/.test(userAgent) ? 'iPad' : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS' : /CrOS/.test(userAgent) ? 'ChromeOS'
      : /Linux/.test(userAgent) ? 'Linux' : '';
  return sanitizeDeviceLabel(os ? `${browser} on ${os}` : browser) ?? 'Browser';
}

/* ---------- one pass ---------- */

/** How the sync client reads and writes the local progress (the progress store, or a fake in tests). */
export interface SyncHost {
  /** Current local progress, tombstones included. */
  snapshot(): ProgressV2;
  /** Replace local with local ∪ remote and return the result. Must not do anything else to local data. */
  applyRemote(remote: ProgressV2): ProgressV2;
}

export type SyncOutcome =
  | { kind: 'ok'; version: number | null }
  /** Network failure, 5xx, or the 412 loop ran out: local data is untouched, try again later. */
  | { kind: 'retry' }
  | { kind: 'too_large' }
  | { kind: 'no_permission' }
  | { kind: 'not_connected' }
  /** 400/415/428 or an unreadable server document: a bug, not a transient failure. */
  | { kind: 'error'; status: number | null }
  | { kind: 'needs_review' };

class Stop extends Error {
  outcome: SyncOutcome;
  constructor(outcome: SyncOutcome) {
    super(outcome.kind);
    this.outcome = outcome;
  }
}
class NetworkFail extends Error {}

interface Meta { version: number; sha256: string; written_at: string }

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (deps: Pick<Deps, 'sha256'>, text: string) => hex(await deps.sha256(new TextEncoder().encode(text)));

const parseMeta = (value: unknown): Meta | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1 || typeof v.sha256 !== 'string') return null;
  return { version: v.version, sha256: v.sha256, written_at: typeof v.written_at === 'string' ? v.written_at : '' };
};

const classify = (status: number): SyncOutcome => {
  if (status === 413) return { kind: 'too_large' };
  if (status === 408 || status === 429 || status >= 500) return { kind: 'retry' };
  return { kind: 'error', status };
};

async function call(deps: Deps, method: 'GET' | 'PUT', path: string, options?: { body?: string; headers?: Record<string, string> }) {
  try {
    return await syncRequest(deps, method, path, options);
  } catch (error) {
    if (error instanceof LifeHubError) {
      if (error.kind === 'network') throw new NetworkFail();
      if (error.kind === 'no_sync_scope') throw new Stop({ kind: 'no_permission' });
      if (error.kind === 'not_connected') throw new Stop({ kind: 'not_connected' });
      throw new Stop({ kind: 'retry' });
    }
    throw error;
  }
}
/** Reads in a pass: any network failure just ends the pass (nothing local changed yet). */
async function read(deps: Deps, path: string) {
  try {
    return await call(deps, 'GET', path);
  } catch (error) {
    if (error instanceof NetworkFail) throw new Stop({ kind: 'retry' });
    throw error;
  }
}

async function getMeta(deps: Deps): Promise<Meta | null> {
  const response = await read(deps, '/meta');
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Stop(classify(response.status));
  const meta = parseMeta(await response.json().catch(() => null));
  if (!meta) throw new Stop({ kind: 'retry' });
  raiseClockFloor(meta.written_at);
  return meta;
}

async function getFull(deps: Deps): Promise<{ meta: Meta; progress: ProgressV2 } | null> {
  const response = await read(deps, '');
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Stop(classify(response.status));
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const meta = parseMeta(body);
  if (!meta || !body) throw new Stop({ kind: 'retry' });
  // Never merge into, or write over, a document in a format this client does not know.
  const progress = progressOfDocV2(body.doc);
  if (!progress) throw new Stop({ kind: 'error', status: null });
  raiseClockFloor(meta.written_at);
  return { meta, progress };
}

/** The server document for the manual import preview (a device that must not auto-merge). Changes nothing local. */
export async function fetchServerDocument(deps: Deps): Promise<{ progress: ProgressV2; writtenAt: string } | null> {
  try {
    const full = await getFull(deps);
    return full ? { progress: full.progress, writtenAt: full.meta.written_at } : null;
  } catch (error) {
    if (error instanceof Stop) {
      throw new LifeHubError(error.outcome.kind === 'not_connected' ? 'not_connected' : error.outcome.kind === 'no_permission' ? 'no_sync_scope' : 'server',
        'Life Hub에서 동기화 문서를 가져오지 못했어요.');
    }
    throw error;
  }
}

/** One sync pass. Never throws for network/HTTP problems; those become outcomes. */
export async function runSync(deps: Deps, host: SyncHost, label: string | null = null): Promise<SyncOutcome> {
  try {
    return await pass(deps, host, label);
  } catch (error) {
    if (error instanceof Stop) return error.outcome;
    if (error instanceof NetworkFail) return { kind: 'retry' };
    throw error;
  }
}

async function pass(deps: Deps, host: SyncHost, label: string | null): Promise<SyncOutcome> {
  const before = readState(deps.storage);
  if (needsReview(before, deps.now())) return { kind: 'needs_review' };
  if (!mayHaveSyncScope(deps)) return { kind: 'no_permission' };

  const hashOf = (progress: ProgressV2) => sha256Hex(deps, canonicalJson(progress));
  const success = (version: number | null, hash: string): SyncOutcome => {
    updateState(deps.storage, { version, syncedHash: hash, lastSyncAt: deps.now(), halt: null });
    return { kind: 'ok', version };
  };

  let known: Meta | null = await getMeta(deps);
  // Nothing new on the server and nothing unsent here: done after one cheap request.
  if (known && known.version === before.version && before.syncedHash === (await hashOf(pruneTombstones(host.snapshot(), deps.now())))) {
    return success(known.version, before.syncedHash);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let serverVersion: number | null = null;
    let remote: ProgressV2 | null = null;
    if (known) {
      const full = await getFull(deps);
      if (full) {
        serverVersion = full.meta.version;
        remote = full.progress;
      }
    }
    // Local only ever becomes local ∪ server. Tombstones older than 180 days are dropped here, just before writing.
    const candidate = pruneTombstones(host.applyRemote(remote ?? {}), deps.now());
    const hash = await hashOf(candidate);
    if (remote && sameProgress(candidate, remote)) return success(serverVersion, hash);
    // Nothing here and nothing there: do not create an empty document just because sync was turned on.
    if (!remote && Object.keys(candidate).length === 0) return success(null, hash);

    // The exact string that goes on the wire is kept: the hash covers its UTF-8 bytes, not a re-serialisation.
    const body = JSON.stringify(makeDocV2(candidate, new Date(deps.now())));
    const sha = await sha256Hex(deps, body);
    const headers: Record<string, string> = serverVersion === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${serverVersion}"` };
    // An empty label is a 400 on the server, so the header is left out unless something printable remains.
    const cleanLabel = sanitizeDeviceLabel(label);
    if (cleanLabel) headers['X-Device-Label'] = cleanLabel;

    let response: Response | null = null;
    try {
      response = await call(deps, 'PUT', '', { body, headers });
    } catch (error) {
      if (!(error instanceof NetworkFail)) throw error;
    }

    if (response === null || response.status >= 500) {
      // The outcome is unknown: the write may have landed. Look before sending anything again.
      let meta: Meta | null | undefined;
      try {
        meta = await getMeta(deps);
      } catch (error) {
        if (!(error instanceof Stop)) throw error;
        meta = undefined;
      }
      if (meta && meta.sha256 === sha) return success(meta.version, hash);
      if (meta === undefined) return { kind: 'retry' };
      known = meta;
      continue;
    }

    if (response.status === 200) {
      const meta = parseMeta(await response.json().catch(() => null));
      raiseClockFloor(meta?.written_at);
      return success(meta?.version ?? (serverVersion ?? 0) + 1, hash);
    }
    if (response.status === 412) {
      const current = (await response.json().catch(() => null) as { current?: unknown } | null)?.current;
      if (current === null) {
        known = null; // the document was deleted: write again with If-None-Match: *
        continue;
      }
      const meta = parseMeta(current);
      if (!meta) return { kind: 'retry' };
      raiseClockFloor(meta.written_at);
      if (meta.sha256 === sha) return success(meta.version, hash); // our own write, already committed
      known = meta;
      continue;
    }
    return classify(response.status);
  }
  return { kind: 'retry' };
}
