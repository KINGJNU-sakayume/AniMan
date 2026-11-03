// 합성 데이터용 가짜 Life Hub 동기화 서버 — life-hub 의 src/sync/api.js·store.js 동작을 메모리에서 흉내 낸다.
// 테스트(vitest)와 e2e(Playwright, page.route)가 함께 쓴다. 실제 Life Hub 에는 요청을 보내지 않는다.
//
//   GET /sync/meta  → 200 { version, sha256, size_bytes, written_at, device } | 404 { error }
//   GET /sync       → 200 { …meta, doc } | 404
//   PUT /sync       → If-Match: "<version>" 로 교체, If-None-Match: * 로 최초 쓰기.
//                     200 meta | 400 | 412 { error, current } | 413 | 415 | 428
// 버전은 쓰기마다 정확히 1 증가하고, sha256 은 받은 본문의 UTF-8 바이트로 계산한다.

export interface FakeRequest {
  method: string;
  /** `/sync`, `/sync/meta` … (API 접두사를 뗀 경로) */
  path: string;
  headers: Record<string, string>;
  body?: string;
}
export interface FakeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface StoredVersion {
  version: number;
  body: string;
  sha256: string;
  size_bytes: number;
  device: string | null;
  written_at: string;
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
export const sha256OfText = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status: number, value: unknown, extra: Record<string, string> = {}): FakeResponse => ({
  status,
  headers: { ...JSON_HEADERS, ...extra },
  body: value === null ? '' : JSON.stringify(value),
});

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createFakeSyncServer(options: { maxBytes?: number; now?: () => number; keep?: number; syncScope?: boolean } = {}) {
  const maxBytes = options.maxBytes ?? 1048576;
  const keep = options.keep ?? 10;
  let clock = options.now ?? (() => Date.now());
  const versions: StoredVersion[] = [];
  const log: Array<{ method: string; path: string; status: number }> = [];
  const state = { syncScope: options.syncScope ?? true };

  const meta = (row: StoredVersion) => ({
    version: row.version, sha256: row.sha256, size_bytes: row.size_bytes, written_at: row.written_at, device: row.device,
  });
  const current = () => versions[versions.length - 1] ?? null;

  const handleInner = async (request: FakeRequest): Promise<FakeResponse> => {
    if (!/^Bearer \S+$/.test(request.headers.authorization ?? '')) return reply(401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer realm="OAuth", error="invalid_token"' });
    if (!state.syncScope) {
      return reply(403, { error: 'insufficient_scope' }, {
        'WWW-Authenticate': 'Bearer realm="OAuth", error="insufficient_scope", scope="animan:sync"',
      });
    }
    const row = current();
    if (request.path === '/sync/meta') {
      if (request.method !== 'GET') return reply(405, { error: 'Method not allowed' });
      return row ? reply(200, meta(row)) : reply(404, { error: 'No document yet' });
    }
    if (request.path !== '/sync') return reply(404, { error: 'Not found' });
    if (request.method === 'GET') return row ? reply(200, { ...meta(row), doc: JSON.parse(row.body) }) : reply(404, { error: 'No document yet' });
    if (request.method !== 'PUT') return reply(405, { error: 'Method not allowed' });

    const ifMatch = request.headers['if-match'];
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifMatch !== undefined && ifNoneMatch !== undefined) return reply(400, { error: 'Use either If-Match or If-None-Match' });
    if (ifMatch === undefined && ifNoneMatch === undefined) return reply(428, { error: 'If-Match is required' });
    let base = 0;
    if (ifNoneMatch !== undefined) {
      if (ifNoneMatch.trim() !== '*') return reply(400, { error: 'Invalid If-None-Match' });
    } else {
      const m = /^(?:"([1-9][0-9]{0,14})"|([1-9][0-9]{0,14}))$/.exec(ifMatch!.trim());
      if (!m) return reply(400, { error: 'Invalid If-Match' });
      base = Number(m[1] ?? m[2]);
    }
    let device: string | null = null;
    if (request.headers['x-device-label'] !== undefined) {
      const label = request.headers['x-device-label'].trim();
      if (!/^[\x20-\x7e]{1,40}$/.test(label)) return reply(400, { error: 'Invalid X-Device-Label' });
      device = label;
    }
    if (!/^application\/json(\s*;|\s*$)/i.test(request.headers['content-type'] ?? '')) return reply(415, { error: 'application/json required' });
    const body = request.body ?? '';
    const size = new TextEncoder().encode(body).byteLength;
    if (size > maxBytes) return reply(413, { error: 'Document too large' });
    let doc: unknown;
    try {
      doc = JSON.parse(body);
    } catch {
      return reply(400, { error: 'Invalid JSON' });
    }
    if (!isObject(doc) || doc.app !== 'animan' || doc.version !== 2 || !isObject(doc.progress)) return reply(400, { error: 'Invalid document' });

    // Hash first, then check and insert with no await in between: like the real conditional INSERT, the
    // check-and-write is atomic, so two racing writers from the same base cannot both win.
    const sha256 = await sha256OfText(body);
    const newest = current();
    if ((newest?.version ?? 0) !== base) return reply(412, { error: 'Precondition failed', current: newest ? meta(newest) : null });
    const written: StoredVersion = {
      version: base + 1, body, sha256, size_bytes: size, device, written_at: new Date(clock()).toISOString(),
    };
    versions.push(written);
    while (versions.length > keep) versions.shift();
    return reply(200, meta(written));
  };

  return {
    versions,
    log,
    state,
    setClock(now: () => number) {
      clock = now;
    },
    current,
    /** 서버 문서(없으면 null) */
    document: () => (current() ? (JSON.parse(current()!.body) as { progress: Record<string, Record<string, { done: boolean; at: string }>> }) : null),
    handle: async (request: FakeRequest): Promise<FakeResponse> => {
      const response = await handleInner({ ...request, headers: Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v])) });
      log.push({ method: request.method, path: request.path, status: response.status });
      return response;
    },
  };
}
export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>;
