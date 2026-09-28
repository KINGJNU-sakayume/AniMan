// e2e/support/mockSupabase.ts
// In-browser stand-in for Supabase (a small PostgREST + GoTrue subset) built on
// Playwright request interception. Tests run hermetically: no real project,
// no credentials, no external image hosts.
import type { Page, Route, Request } from '@playwright/test';
import { buildTables, IMAGE_HOST, type MockTables, type ProfileRow } from './fixtures';
import { placeholderSvg } from './placeholderImage';

export const MOCK_SUPABASE_URL = 'https://animan-e2e.supabase.co';
export const MOCK_ANON_KEY = 'e2e-anon-key';
const STORAGE_KEY = `sb-${new URL(MOCK_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const USERS = {
  tester: { id: '00000000-0000-4000-8000-000000000001', username: 'tester', password: 'password123', is_approved: true, role: 'user' },
  admin: { id: '00000000-0000-4000-8000-000000000002', username: 'admin', password: 'password123', is_approved: true, role: 'admin' },
  pending: { id: '00000000-0000-4000-8000-000000000003', username: 'pending', password: 'password123', is_approved: false, role: 'user' },
} as const;

export type MockUserName = keyof typeof USERS;

export interface MockOptions {
  /** Pre-seed a stored session for this user (skips the login screen). */
  loginAs?: MockUserName;
  /** Initial progress for the logged-in user: seriesId → completed ids. */
  progress?: Record<string, string[]>;
  /** Tables whose REST calls respond with HTTP 500. */
  failTables?: string[];
  /** Artificial latency for REST calls, in ms. */
  delayMs?: number;
}

export interface RecordedCall {
  method: string;
  table: string;
  search: string;
  body: unknown;
}

export interface MockSupabase {
  tables: MockTables;
  calls: RecordedCall[];
  /** Completed ids currently stored for the given user/series. */
  storedProgress: (seriesId: string, user?: MockUserName) => string[];
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function makeUser(profile: { id: string; username: string }) {
  const now = new Date().toISOString();
  return {
    id: profile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${profile.username}@animan.local`,
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: profile.username },
    identities: [],
    created_at: now,
    updated_at: now,
  };
}

function makeSession(profile: { id: string; username: string }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const accessToken = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: profile.id, role: 'authenticated', aud: 'authenticated', exp: expiresAt, email: `${profile.username}@animan.local` }),
    'signature',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: expiresAt,
    refresh_token: `refresh-${profile.id}`,
    user: makeUser(profile),
  };
}

function userIdFromRequest(request: Request): string | null {
  const token = request.headers()['authorization']?.replace(/^Bearer\s+/i, '') ?? '';
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).sub ?? null;
  } catch {
    return null;
  }
}

interface SelectNode { name: string; children?: SelectNode[] }

function parseSelect(select: string): SelectNode[] {
  const nodes: SelectNode[] = [];
  let depth = 0;
  let token = '';
  const flush = () => {
    const t = token.trim();
    token = '';
    if (!t) return;
    const open = t.indexOf('(');
    if (open === -1) {
      nodes.push({ name: t.includes(':') ? t.split(':')[1] : t });
    } else {
      nodes.push({ name: t.slice(0, open).split(':').pop()!.split('!')[0], children: parseSelect(t.slice(open + 1, -1)) });
    }
  };
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) flush();
    else token += ch;
  }
  flush();
  return nodes;
}

const foreignKeyFor = (parentTable: string) => (parentTable === 'series' ? 'series_id' : `${parentTable.replace(/s$/, '')}_id`);

function project(tables: MockTables, table: string, row: Record<string, unknown>, nodes: SelectNode[]) {
  if (nodes.length === 0 || nodes.some((n) => n.name === '*' && !n.children)) {
    const base: Record<string, unknown> = { ...row };
    nodes.filter((n) => n.children).forEach((n) => { base[n.name] = embed(tables, table, row, n); });
    return base;
  }
  const out: Record<string, unknown> = {};
  nodes.forEach((n) => { out[n.name] = n.children ? embed(tables, table, row, n) : row[n.name]; });
  return out;
}

function embed(tables: MockTables, parentTable: string, parentRow: Record<string, unknown>, node: SelectNode) {
  const fk = foreignKeyFor(parentTable);
  return (tables[node.name] ?? [])
    .filter((child) => child[fk] === parentRow.id)
    .map((child) => project(tables, node.name, child, node.children ?? []));
}

function matches(row: Record<string, unknown>, column: string, expr: string): boolean {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const value = row[column];
  const cmp = (v: string) => (typeof value === 'number' ? Number(v) : v);
  switch (op) {
    case 'eq': return String(value) === raw;
    case 'neq': return String(value) !== raw;
    case 'gt': return (value as number) > (cmp(raw) as number);
    case 'gte': return (value as number) >= (cmp(raw) as number);
    case 'lt': return (value as number) < (cmp(raw) as number);
    case 'lte': return (value as number) <= (cmp(raw) as number);
    case 'is': return raw === 'null' ? value == null : String(value) === raw;
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')).includes(String(value));
    default: return true;
  }
}

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function applyFilters(rows: Record<string, unknown>[], params: URLSearchParams) {
  let result = rows;
  params.forEach((expr, column) => {
    if (RESERVED_PARAMS.has(column)) return;
    result = result.filter((row) => matches(row, column, expr));
  });
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((part) => {
      const [col, dir] = part.split('.');
      return { col, desc: dir === 'desc' };
    });
    result = [...result].sort((a, b) => {
      for (const { col, desc } of keys) {
        const av = a[col] as string | number, bv = b[col] as string | number;
        if (av === bv) continue;
        return (av < bv ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  const limit = params.get('limit');
  return limit ? result.slice(0, Number(limit)) : result;
}

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  });

// ── main entry ──────────────────────────────────────────────────────────────────────────
export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<MockSupabase> {
  const tables = buildTables();
  const calls: RecordedCall[] = [];
  const profiles: ProfileRow[] = Object.values(USERS).map(({ id, username, is_approved, role }) => ({ id, username, is_approved, role }));
  const passwords = new Map<string, string>(Object.values(USERS).map((u) => [u.username, u.password]));
  tables.profiles = profiles;

  if (options.loginAs && options.progress) {
    const userId = USERS[options.loginAs].id;
    Object.entries(options.progress).forEach(([seriesId, ids], i) => {
      tables.user_progress.push({ id: `progress-${i}`, user_id: userId, series_id: seriesId, completed_ids: ids, updated_at: new Date().toISOString() });
    });
  }

  if (options.loginAs) {
    const session = makeSession(USERS[options.loginAs]);
    await page.addInitScript(
      ({ key, value }) => {
        // Seed once per tab so logout + reload really logs out.
        if (sessionStorage.getItem('__e2e_seeded')) return;
        sessionStorage.setItem('__e2e_seeded', '1');
        localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: JSON.stringify(session) },
    );
  }

  // CORS preflights
  await page.route(`${MOCK_SUPABASE_URL}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
    }
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/')) return handleAuth(route, url);
    if (url.pathname.startsWith('/rest/v1/')) return handleRest(route, url);
    return json(route, 404, { message: 'not mocked' });
  });

  // Hermetic images and embeds
  await page.route(`${IMAGE_HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    const [, kind, file] = url.pathname.split('/');
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: placeholderSvg(kind, decodeURIComponent(file ?? ''), url.searchParams.get('label') ?? '', url.searchParams.get('accent') ?? ''),
    });
  });
  await page.route(/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|ytimg\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>yt</title>' }),
  );

  async function handleAuth(route: Route, url: URL) {
    const request = route.request();
    const path = url.pathname.replace('/auth/v1/', '');
    const body = request.postDataJSON?.() ?? null;

    if (path === 'token' && url.searchParams.get('grant_type') === 'password') {
      const username = String(body?.email ?? '').replace(/@animan\.local$/, '');
      const profile = profiles.find((p) => p.username === username);
      if (!profile || passwords.get(username) !== body?.password) {
        return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      return json(route, 200, makeSession(profile));
    }
    if (path === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const id = String(body?.refresh_token ?? '').replace(/^refresh-/, '');
      const profile = profiles.find((p) => p.id === id);
      return profile ? json(route, 200, makeSession(profile)) : json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    if (path === 'signup') {
      const username = String(body?.email ?? '').replace(/@animan\.local$/, '');
      if (profiles.some((p) => p.username === username)) {
        return json(route, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      }
      const profile: ProfileRow = { id: `00000000-0000-4000-8000-${String(profiles.length + 1).padStart(12, '0')}`, username, is_approved: false, role: 'user' };
      profiles.push(profile);
      passwords.set(username, String(body?.password ?? ''));
      return json(route, 200, makeSession(profile));
    }
    if (path === 'logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === 'user') {
      const id = userIdFromRequest(request);
      const profile = profiles.find((p) => p.id === id);
      return profile ? json(route, 200, makeUser(profile)) : json(route, 401, { code: 401, msg: 'invalid JWT' });
    }
    return json(route, 404, { msg: `auth endpoint not mocked: ${path}` });
  }

  async function handleRest(route: Route, url: URL) {
    const request = route.request();
    const method = request.method();
    const table = url.pathname.replace('/rest/v1/', '');
    const params = url.searchParams;
    const headers = request.headers();
    const wantsObject = (headers['accept'] ?? '').includes('vnd.pgrst.object');
    const prefer = headers['prefer'] ?? '';
    const body = method === 'GET' || method === 'DELETE' ? null : request.postDataJSON?.() ?? null;
    calls.push({ method, table, search: url.search, body });

    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.failTables?.includes(table)) {
      return json(route, 500, { code: 'XX000', message: `mock failure for ${table}`, details: null, hint: null });
    }

    const userId = userIdFromRequest(request);
    let rows = (tables[table] ?? []) as Record<string, unknown>[];
    // Row-level security, roughly: users only ever see their own rows.
    if (table === 'profiles') rows = rows.filter((r) => r.id === userId);
    if (table === 'user_progress') rows = rows.filter((r) => r.user_id === userId);

    const select = parseSelect(params.get('select') ?? '*');
    const respond = (result: Record<string, unknown>[], status: number) => {
      const shaped = result.map((r) => project(tables, table, r, select));
      if (wantsObject) {
        if (shaped.length !== 1) {
          return json(route, 406, { code: 'PGRST116', details: `The result contains ${shaped.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
        }
        return json(route, status, shaped[0]);
      }
      return json(route, status, shaped);
    };

    if (method === 'GET') return respond(applyFilters(rows, params), 200);

    if (method === 'POST') {
      const incoming = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
      const conflictCols = params.get('on_conflict')?.split(',') ?? [];
      const upsert = prefer.includes('resolution=merge-duplicates');
      const target = (tables[table] ??= []) as Record<string, unknown>[];
      const written = incoming.map((values) => {
        const existing = upsert && conflictCols.length
          ? target.find((r) => conflictCols.every((c) => r[c] === values[c]))
          : undefined;
        if (existing) return Object.assign(existing, values);
        const row = { id: `${table}-${target.length + 1}-${Date.now()}`, created_at: new Date().toISOString(), ...values };
        target.push(row);
        return row;
      });
      if (prefer.includes('return=representation')) return respond(written, 201);
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }

    if (method === 'PATCH') {
      const updated = applyFilters(rows, params).map((r) => Object.assign(r, body));
      if (prefer.includes('return=representation')) return respond(updated, 200);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    if (method === 'DELETE') {
      const doomed = new Set(applyFilters(rows, params));
      tables[table] = (tables[table] ?? []).filter((r) => !doomed.has(r));
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    return json(route, 405, { message: `method ${method} not mocked` });
  }

  return {
    tables,
    calls,
    storedProgress: (seriesId, user = options.loginAs ?? 'tester') =>
      tables.user_progress.find((r) => r.series_id === seriesId && r.user_id === USERS[user].id)?.completed_ids ?? [],
  };
}
