/**
 * AniMan ↔ Life Hub connection.
 *
 * - Connect: OAuth 2.1 authorization code + PKCE (S256); AniMan is a public client identified by
 *   public/lifehub-client.json. It asks for `animan:inbox animan:sync animan:board`; whether the sync scope is actually
 *   granted is decided by the owner's checkbox on Life Hub's consent page, so the token response's `scope`
 *   is kept. Life Hub returns to /lifehub/ (public/lifehub/index.html), which hands the result to the app.
 * - Proposals (`media_progress`) are fetched live and validated again here; nothing is marked until
 *   the owner approves one on the landing page.
 * - Receipts (proposal → series ID) and rejections are kept in localStorage and retried until answered.
 */
export const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
export const APP_URL = 'https://kingjnu-sakayume.github.io/animan/';
export const CALLBACK_URL = APP_URL + 'lifehub/';
export const CLIENT_ID = APP_URL + 'lifehub-client.json';
export const RESOURCE = LIFEHUB_ORIGIN + '/animan';
export const INBOX_SCOPE = 'animan:inbox';
export const SYNC_SCOPE = 'animan:sync';
export const BOARD_SCOPE = 'animan:board';
export const SCOPE = `${INBOX_SCOPE} ${SYNC_SCOPE} ${BOARD_SCOPE}`;
const API = LIFEHUB_ORIGIN + '/animan/v1';
/** Written by public/lifehub/index.html. */
export const CALLBACK_KEY = 'animan.lifehub.callback.v1';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Deps {
  fetch: typeof fetch;
  storage: KV;
  session: KV;
  now: () => number;
  random: (bytes: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
}
export function browserDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    storage: localStorage,
    session: sessionStorage,
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

/** 'no_sync_scope': the token is valid but was granted without the sync checkbox (the inbox still works). */
/** 'no_board_scope': the token has no `animan:board` (connected before that scope existed); the token is kept. */
export type LifeHubErrorKind = 'not_connected' | 'denied' | 'state' | 'network' | 'server' | 'no_sync_scope' | 'no_board_scope';
export class LifeHubError extends Error {
  kind: LifeHubErrorKind;
  constructor(kind: LifeHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/* ---------- contract (mirrors life-hub src/adapters/animan.js) ---------- */

export interface ProgressProposal {
  key: string;
  createdAt: string;
  title: string;
  kind: 'episode' | 'volume';
  season: number | null;
  upTo: number | null;
  numbers: number[] | null;
  note: string | null;
  /** 'approved' = the owner approved it in a Claude card (not marked yet). */
  status: 'pending' | 'approved';
  /** Life Hub asks AniMan for a last check. */
  needsAppReview: boolean;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || text(v, max);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const KEY = /^(claude|chatgpt|codex|manual):[A-Za-z0-9_.:-]{8,128}$/;

/** Validates one item from the hub; null for anything that does not match the contract. The owner's card edit wins. */
export function parseProposal(item: unknown): ProgressProposal | null {
  if (!obj(item) || typeof item.key !== 'string' || !KEY.test(item.key)) return null;
  if (item.status !== undefined && item.status !== 'pending' && item.status !== 'approved') return null;
  const c = item.final_candidate ?? item.candidate;
  if (!obj(c)) return null;
  if (c.schema_version !== 1 || c.candidate_type !== 'media_progress' || typeof c.source !== 'string' ||
    `${c.source}:${String(c.idempotency_key)}` !== item.key || typeof c.created_at !== 'string' || !obj(c.payload)) return null;
  const p = c.payload;
  if (!only(p, ['title', 'kind', 'season', 'up_to', 'numbers', 'note']) || !text(p.title, 100) ||
    (p.kind !== 'episode' && p.kind !== 'volume') || !optText(p.note, 300)) return null;
  if (p.season !== undefined && (p.kind !== 'episode' || !int(p.season, 1, 30))) return null;
  if ((p.up_to === undefined) === (p.numbers === undefined)) return null;
  if (p.up_to !== undefined && !int(p.up_to, 1, 5000)) return null;
  let numbers: number[] | null = null;
  if (p.numbers !== undefined) {
    const list = p.numbers;
    if (!Array.isArray(list) || list.length === 0 || list.length > 50 || !list.every((n) => int(n, 1, 5000)) || new Set(list).size !== list.length) return null;
    numbers = list as number[];
  }
  return {
    key: item.key, createdAt: c.created_at, title: p.title.trim(), kind: p.kind,
    season: typeof p.season === 'number' ? p.season : null,
    upTo: typeof p.up_to === 'number' ? p.up_to : null,
    numbers,
    note: typeof p.note === 'string' ? p.note.trim() : null,
    status: item.status === 'approved' ? 'approved' : 'pending',
    needsAppReview: item.needs_app_review === true,
  };
}

/* ---------- OAuth ---------- */

const TOKENS_KEY = 'animan.lifehub.tokens.v1';
const PENDING_AUTH_KEY = 'animan.lifehub.pending-auth.v1';
const OUTCOMES_KEY = 'animan.lifehub.outcomes.v1';
const REJECTIONS_KEY = 'animan.lifehub.rejections.v1';
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
interface Tokens { access_token: string; access_expires_at: number; refresh_token: string; scope?: string }
interface PendingAuth { state: string; verifier: string; created_at: number }
export type Outcome = 'confirmed' | 'rejected' | 'conflict' | 'missing';

function readJson<T>(store: KV, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function connectAvailable(loc: { origin: string; pathname: string }): boolean {
  const app = new URL(APP_URL);
  return loc.origin === app.origin && loc.pathname.startsWith(app.pathname) && !loc.pathname.startsWith(app.pathname + 'preview/');
}
export function isConnected(deps: Pick<Deps, 'storage'>): boolean {
  return typeof readJson<Tokens>(deps.storage, TOKENS_KEY)?.refresh_token === 'string';
}

/** The scopes the stored token is known to carry, or null when unknown (e.g. a token from before scopes were kept). */
export function grantedScopes(deps: Pick<Deps, 'storage'>): string[] | null {
  const scope = readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : null;
}
/** False only when the token is known to lack the sync scope; unknown scopes are tried (a 403 then tells). */
export const mayHaveSyncScope = (deps: Pick<Deps, 'storage'>): boolean => grantedScopes(deps)?.includes(SYNC_SCOPE) ?? true;

/** False only when the token is known to lack the board scope; unknown scopes are tried (a 403 then tells). */
export const mayHaveBoardScope = (deps: Pick<Deps, 'storage'>): boolean => grantedScopes(deps)?.includes(BOARD_SCOPE) ?? true;

export async function beginConnect(deps: Deps): Promise<string> {
  const verifier = b64url(deps.random(32));
  const state = b64url(deps.random(16));
  const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
  const pending: PendingAuth = { state, verifier, created_at: deps.now() };
  deps.session.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE,
  });
  return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
}

async function tokenRequest(deps: Deps, params: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
  } catch {
    throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      deps.storage.removeItem(TOKENS_KEY);
      throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.');
    }
    throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${response.status})`);
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
    throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  // A refresh response without `scope` keeps what the grant was known to carry; a new grant without it stays unknown.
  const previous = params.grant_type === 'refresh_token' ? readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope : undefined;
  const scope = typeof body.scope === 'string' ? body.scope : previous;
  const tokens: Tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000,
    ...(scope === undefined ? {} : { scope }),
  };
  deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/** Finish a sign-in whose result the callback page left in this tab. Returns false when there is none. */
export async function completeStoredCallback(deps: Deps): Promise<boolean> {
  const search = deps.session.getItem(CALLBACK_KEY);
  if (search === null) return false;
  deps.session.removeItem(CALLBACK_KEY);
  const q = new URLSearchParams(search);
  const pending = readJson<PendingAuth>(deps.session, PENDING_AUTH_KEY);
  deps.session.removeItem(PENDING_AUTH_KEY);
  if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
    throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
  if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
  if (q.has('error')) throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
  const code = q.get('code');
  if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
  await tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: pending.verifier, resource: RESOURCE });
  return true;
}

async function accessToken(deps: Deps, force = false): Promise<string> {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  if (!tokens?.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
  if (!force && tokens.access_expires_at - 60_000 > deps.now()) return tokens.access_token;
  return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).access_token;
}

async function api(deps: Deps, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

const SYNC_TIMEOUT_MS = 30_000;

/**
 * A request to the device sync API (`/animan/v1/sync*`). Differs from `api()` in the 403 handling only:
 * a 403 with `WWW-Authenticate: ... error="insufficient_scope"` means the token has the inbox scope only, so the token
 * is KEPT (the inbox still works with it) and `no_sync_scope` is thrown. Any other 403, or a 401 that survives one
 * token refresh, means the grant is unusable: the token is dropped, as in `api()`.
 * Never put a response body or a token into an error message.
 */
export async function syncRequest(
  deps: Deps,
  method: 'GET' | 'PUT',
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + '/sync' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: options.body }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(SYNC_TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403 && /error="?insufficient_scope"?/i.test(response.headers.get('WWW-Authenticate') ?? ''))
    throw new LifeHubError('no_sync_scope', '이 연결에는 동기화 권한이 없어요. 다시 연결하면서 동기화를 허용해 주세요.');
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

const BOARD_TIMEOUT_MS = 30_000;

/**
 * The board upload (`PUT /animan/v1/board`). Kept apart from `api()`/`syncRequest()` on purpose: those drop the
 * Life Hub token on any 401/403, which would cut the inbox and the device sync over a missing board permission.
 * Here a 403 with `WWW-Authenticate: ... error="insufficient_scope"` is checked FIRST: the token is KEPT and
 * `no_board_scope` is thrown. A 401 that survives one token refresh, or any other 403, means the grant is unusable:
 * the token is dropped, as everywhere else. Never put a response body or a token into an error message.
 */
export async function boardRequest(deps: Deps, body: string): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + '/board', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(BOARD_TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403 && /error="?insufficient_scope"?/i.test(response.headers.get('WWW-Authenticate') ?? ''))
    throw new LifeHubError('no_board_scope', '보드에 올리려면 Life Hub에 다시 연결해 주세요.');
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

export function disconnect(deps: Deps): void {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  deps.storage.removeItem(TOKENS_KEY);
  if (tokens?.refresh_token)
    void deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString(),
    }).catch(() => undefined);
}

/* ---------- local decisions and outbox ---------- */

const RECEIPTS_KEY = 'animan.lifehub.receipts.v1';
const AUTO_APPLY_KEY = 'animan.lifehub.auto-apply.v1';
const SERIES_REFS_KEY = 'animan.lifehub.series-refs.v1';

/** 「Claude에서 승인된 항목 자동 반영」: on unless turned off on this device. */
export const autoApplyEnabled = (deps: Pick<Deps, 'storage'>) => deps.storage.getItem(AUTO_APPLY_KEY) !== 'off';
export function setAutoApply(deps: Pick<Deps, 'storage'>, on: boolean): void {
  if (on) deps.storage.removeItem(AUTO_APPLY_KEY);
  else deps.storage.setItem(AUTO_APPLY_KEY, 'off');
}

export interface SeriesRef { id: string; label: string; group: string }
/** The catalogue as Life Hub sees it for the card: series id, title and accent colour. No progress. */
export function seriesRefs(catalog: Array<{ id: string; title: string; accent_color?: string | null }>): SeriesRef[] {
  return catalog
    .filter((s) => /^[A-Za-z0-9_.:-]{1,64}$/.test(s.id) && s.title.trim())
    .slice(0, 500)
    .map((s) => ({ id: s.id, label: s.title.trim().slice(0, 80), group: (s.accent_color && /^#[0-9a-fA-F]{3,8}$/.test(s.accent_color) ? s.accent_color : '#03acb1') }));
}
/**
 * Shares the catalogue titles when they changed. A newer revision wins on Life Hub; a 409 (another device, or a
 * clock ahead of ours, sent a later one) is not recorded as sent, so the next sync sends them again later.
 */
export async function uploadSeriesRefs(items: SeriesRef[], deps: Deps): Promise<boolean> {
  const body = JSON.stringify(items);
  const last = readJson<{ revision: number; body: string }>(deps.storage, SERIES_REFS_KEY);
  if (!items.length || last?.body === body) return false;
  const revision = Math.max(deps.now(), (last?.revision ?? 0) + 1);
  const response = await api(deps, 'PUT', '/refs/series', { revision, items });
  if (!response.ok) return false;
  deps.storage.setItem(SERIES_REFS_KEY, JSON.stringify({ revision, body }));
  return true;
}
const ENTITY_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function outcomes(deps: Pick<Deps, 'storage'>): Record<string, Outcome> {
  const map = readJson<Record<string, Outcome>>(deps.storage, OUTCOMES_KEY);
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}
export function rejectLocally(key: string, deps: Pick<Deps, 'storage'>): void {
  const list = readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? [];
  if (!list.includes(key)) deps.storage.setItem(REJECTIONS_KEY, JSON.stringify([...list, key]));
}
/** The owner approved a proposal; the receipt carries the series ID. */
export function rememberReceipt(key: string, logId: string, deps: Pick<Deps, 'storage'>): void {
  const map = readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {};
  map[key] = logId;
  deps.storage.setItem(RECEIPTS_KEY, JSON.stringify(map));
}
export function receipts(deps: Pick<Deps, 'storage'>): Array<{ key: string; logId: string }> {
  const map = readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {};
  return Object.entries(map).filter(([key, id]) => KEY.test(key) && typeof id === 'string' && ENTITY_ID.test(id)).map(([key, logId]) => ({ key, logId }));
}

export interface SyncResult { proposals: ProgressProposal[]; receiptsSent: number; rejectionsSent: number; conflicts: number; waiting: number }

/** Sends decisions, shares the catalogue titles when they changed, then fetches open proposals. Marks nothing. */
export async function sync(deps: Deps, series?: SeriesRef[]): Promise<SyncResult> {
  const done = outcomes(deps);
  const result: SyncResult = { proposals: [], receiptsSent: 0, rejectionsSent: 0, conflicts: 0, waiting: 0 };
  const record = (key: string, response: Response, ok: Outcome) => {
    if (response.ok) done[key] = ok;
    else if (response.status === 409) done[key] = 'conflict';
    else if (response.status === 404) done[key] = 'missing';
    else {
      result.waiting++;
      return false;
    }
    deps.storage.setItem(OUTCOMES_KEY, JSON.stringify(done));
    return response.ok;
  };
  const decided = new Set<string>();
  for (const r of receipts(deps)) {
    decided.add(r.key);
    if (done[r.key]) continue;
    const response = await api(deps, 'POST', '/receipts', { key: r.key, entity_type: 'media_progress', entity_id: r.logId });
    if (record(r.key, response, 'confirmed')) result.receiptsSent++;
  }
  for (const key of readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? []) {
    decided.add(key);
    if (done[key]) continue;
    if (record(key, await api(deps, 'POST', '/rejections', { key }), 'rejected')) result.rejectionsSent++;
  }
  if (series) await uploadSeriesRefs(series, deps).catch(() => false);
  const response = await api(deps, 'GET', '/candidates?status=open&limit=100');
  if (!response.ok) throw new LifeHubError('server', `Life Hub 제안을 가져오지 못했어요 (${response.status})`);
  const body = (await response.json().catch(() => null)) as { candidates?: unknown } | null;
  if (!body || !Array.isArray(body.candidates)) throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  for (const item of body.candidates) {
    const p = parseProposal(item);
    if (p && !decided.has(p.key)) result.proposals.push(p);
  }
  result.conflicts = Object.values(done).filter((v) => v === 'conflict').length;
  return result;
}
