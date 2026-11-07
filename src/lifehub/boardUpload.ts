// src/lifehub/boardUpload.ts
// 보드 타일 목록(manifest)을 Life Hub 로 올린다: PUT /animan/v1/board (스코프 animan:board).
//
// 올리는 것은 보드용 목록뿐이다(앱의 기록 자체는 올리지 않는다). 목록은 buildBoardTiles(순수 함수)가 만들고,
// 이 모듈은 "언제, 올릴지 말지"만 정한다.
//  - 10분에 한 번 이하. 변화가 생기면 마지막 전송에서 10분이 지났으면 바로, 아니면 10분이 차는 때 한 번.
//  - 마지막으로 성공한 본문의 sha256(`generated_at` 뺀 것)과 같으면 보내지 않는다. 단, 앱을 열 때 마지막 성공이
//    하루가 넘었으면 같아도 한 번 보낸다(보드의 '오래됨'은 Hub 가 받은 시각 기준).
//  - '보낼 것 있음'·마지막 성공 sha·시각은 localStorage(개인 데이터 아님). 앱이 닫혀도 다음 실행에서 이어 보낸다.
//  - 올리지 않는 경우: 연결 안 됨, 이 앱의 기록이 하나도 없음, 동기화가 아직 합치기 전(gate).
//  - 실패는 앱의 다른 기능을 막지 않는다. 권한이 없어도(`insufficient_scope`) Life Hub 토큰은 지우지 않는다.
import { buildBoardTiles, hasAnyRecord, type BoardManifest } from '../lib/board/tiles';
import type { ProgressV2 } from '../lib/progress/model';
import type { SeriesRecord } from '../types';
import { boardRequest, grantedScopes, isConnected, LifeHubError, BOARD_SCOPE, type Deps } from './remote';

export const BOARD_STATE_KEY = 'animan.lifehub.board.v1';
export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const DAILY_MS = 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 64 * 1024;

interface BoardState {
  /** 마지막으로 성공한 본문의 sha256(hex, generated_at 제외) */
  sha: string | null;
  lastOkAt: number | null;
  /** 마지막으로 요청을 보낸 시각(성공·실패 모두). 10분 제한의 기준 */
  lastSentAt: number | null;
  lastGeneratedAt: string | null;
  /** 보낼 것이 남아 있음(변화가 있었는데 아직 못 보냄) */
  pending: boolean;
  /** `insufficient_scope`: 다시 연결할 때까지 자동 전송을 멈춘다(토큰은 그대로) */
  halt: 'no_scope' | null;
  /** 400/413 으로 거절된 본문의 sha. 같은 내용으로 다시 보내지 않는다 */
  rejectedSha: string | null;
}

const EMPTY: BoardState = { sha: null, lastOkAt: null, lastSentAt: null, lastGeneratedAt: null, pending: false, halt: null, rejectedSha: null };

export function readBoardState(storage: Pick<Storage, 'getItem'>): BoardState {
  try {
    const raw = storage.getItem(BOARD_STATE_KEY);
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!v || typeof v !== 'object') return { ...EMPTY };
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    const ms = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      sha: str(v.sha), lastOkAt: ms(v.lastOkAt), lastSentAt: ms(v.lastSentAt), lastGeneratedAt: str(v.lastGeneratedAt),
      pending: v.pending === true, halt: v.halt === 'no_scope' ? 'no_scope' : null, rejectedSha: str(v.rejectedSha),
    };
  } catch {
    return { ...EMPTY };
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** 같은 내용이면 같은 해시: generated_at 만 빼고 계산한다. */
export async function manifestHash(manifest: BoardManifest, sha256: Deps['sha256']): Promise<string> {
  const { generated_at: _ignored, ...rest } = manifest;
  void _ignored;
  return hex(await sha256(new TextEncoder().encode(JSON.stringify(rest))));
}

export type AttemptResult =
  | 'sent' | 'unchanged' | 'ignored' | 'skipped' | 'throttled' | 'rejected' | 'no_scope' | 'retry' | 'not_connected';

export interface BoardUploaderOptions {
  deps: Deps;
  getProgress: () => ProgressV2;
  getCatalog: () => SeriesRecord[];
  /** 기기 동기화가 합친 뒤인가. false 면 아직 올리지 않는다(받기 전의 옛 상태를 올리지 않게). */
  ready: () => boolean;
  /** 상태가 바뀌었을 때(화면 안내용) */
  onState?: (s: { needsReconnect: boolean }) => void;
  /** Life Hub 가 토큰을 거부해 연결이 끊겼을 때 */
  onNotConnected?: () => void;
  setTimer?: (fn: () => void, ms: number) => () => void;
}

export function createBoardUploader(options: BoardUploaderOptions) {
  const { deps, getProgress, getCatalog, ready } = options;
  const setTimer = options.setTimer ?? ((fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  });
  let running = false;
  let cancelTimer: (() => void) | null = null;

  const read = () => readBoardState(deps.storage);
  const write = (patch: Partial<BoardState>) => {
    try {
      deps.storage.setItem(BOARD_STATE_KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      /* 저장 실패는 전송을 막지 않는다 */
    }
    if ('halt' in patch) options.onState?.({ needsReconnect: (patch.halt ?? null) === 'no_scope' });
  };
  const arm = (ms: number) => {
    cancelTimer?.();
    cancelTimer = setTimer(() => {
      cancelTimer = null;
      void attempt();
    }, Math.max(1000, ms));
  };

  /**
   * 한 번 시도한다. daily: 마지막 성공이 하루가 넘었으면 내용이 같아도 보낸다(앱을 열 때·탭이 다시 보일 때만 true).
   * 이 함수는 던지지 않는다(앱의 다른 기능을 막지 않는다).
   */
  async function attempt(daily = false): Promise<AttemptResult> {
    if (running) return 'skipped';
    running = true;
    try {
      if (!isConnected(deps) || !ready()) return 'skipped';
      let state = read();
      // 다시 연결해 새 토큰이 board 권한을 갖게 됐으면 멈춤을 푼다.
      if (state.halt === 'no_scope' && grantedScopes(deps)?.includes(BOARD_SCOPE)) {
        write({ halt: null });
        state = read();
      }
      if (state.halt) return 'no_scope';
      const progress = getProgress();
      if (!hasAnyRecord(progress)) return 'skipped'; // 새 기기가 빈 목록으로 덮지 않게
      const now = deps.now();
      const manifest = buildBoardTiles(progress, getCatalog(), now);
      // generated_at 은 이전보다 항상 커야 Hub 가 받는다(기기 시계가 되돌아가도).
      const last = state.lastGeneratedAt ? Date.parse(state.lastGeneratedAt) : NaN;
      if (Number.isFinite(last) && last >= now) manifest.generated_at = new Date(last + 1000).toISOString();
      const sha = await manifestHash(manifest, deps.sha256);
      const stale = daily && (state.lastOkAt === null || now - state.lastOkAt >= DAILY_MS);
      if (sha === state.sha && !stale) {
        write({ pending: false });
        return 'unchanged';
      }
      if (sha === state.rejectedSha) return 'rejected'; // 거절된 내용은 바뀌기 전까지 다시 보내지 않는다
      const body = JSON.stringify(manifest);
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
        console.error('[board] 보드 목록이 64 KiB 를 넘어 올리지 않았어요.');
        write({ rejectedSha: sha, pending: false });
        return 'rejected';
      }
      if (state.lastSentAt !== null && now - state.lastSentAt < MIN_INTERVAL_MS) {
        write({ pending: true });
        arm(state.lastSentAt + MIN_INTERVAL_MS - now);
        return 'throttled';
      }
      cancelTimer?.();
      cancelTimer = null;
      // 요청을 보내기 전에 표시한다: 보내는 동안 또 바뀌면 notifyChange 가 pending 을 다시 세운다.
      write({ lastSentAt: now, pending: false });
      let response: Response;
      try {
        response = await boardRequest(deps, body);
      } catch (e) {
        if (e instanceof LifeHubError && e.kind === 'no_board_scope') {
          write({ halt: 'no_scope', pending: true });
          return 'no_scope';
        }
        if (e instanceof LifeHubError && e.kind === 'not_connected') {
          options.onNotConnected?.();
          return 'not_connected';
        }
        write({ pending: true });
        arm(MIN_INTERVAL_MS);
        return 'retry';
      }
      if (response.ok) {
        const parsed = (await response.json().catch(() => null)) as { ignored?: unknown } | null;
        write({ sha, lastOkAt: deps.now(), lastGeneratedAt: manifest.generated_at, rejectedSha: null });
        return parsed?.ignored === true ? 'ignored' : 'sent';
      }
      if (response.status === 400 || response.status === 413) {
        // 이 앱 쪽 버그이거나 기기 시계 문제. 같은 내용으로 다시 보내지 않는다.
        console.error(`[board] Life Hub 가 보드 목록을 받지 않았어요 (${response.status}).`);
        write({ rejectedSha: sha });
        return 'rejected';
      }
      write({ pending: true });
      arm(MIN_INTERVAL_MS);
      return 'retry';
    } catch {
      return 'retry';
    } finally {
      running = false;
    }
  }

  return {
    attempt,
    /** 타일에 영향을 줄 수 있는 변화(진행 기록·카탈로그). 보낼 것 있음을 남기고 시도한다. */
    notifyChange(): void {
      if (!isConnected(deps)) return;
      write({ pending: true });
      void attempt();
    },
    /** 앱을 열 때·탭이 다시 보일 때: 남은 것, 하루 지난 것을 보낸다. */
    start(): Promise<AttemptResult> {
      return attempt(true);
    },
    /** 다시 연결한 직후: 권한 부족으로 멈춘 것을 풀고 시도한다. */
    notifyConnected(): void {
      if (read().halt) write({ halt: null });
      void attempt();
    },
    needsReconnect: () => read().halt === 'no_scope',
    dispose(): void {
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}

export type BoardUploader = ReturnType<typeof createBoardUploader>;

/**
 * 「동기화가 합친 뒤」 문: 이번 실행에서 기기 동기화가 한 번이라도 성공했거나(받아 합친 뒤의 상태가 됨), 동기화를 하지
 * 않는 연결(권한 없음·꺼짐)이면 이 기기의 상태가 전부라서 올려도 된다. 그 밖에는(동기화 중·재시도·검토 필요 등)
 * 받기 전의 옛 상태를 올리지 않도록 기다린다.
 */
export function createMergedGate(source: {
  phase: () => string;
  onPass: (listener: (kind: string) => void) => () => void;
}) {
  let merged = false;
  source.onPass((kind) => {
    if (kind === 'ok') merged = true;
  });
  return {
    ready: (): boolean => merged || source.phase() === 'no_permission' || source.phase() === 'off',
    /** 연결을 해제했을 때: 다음 연결에서는 다시 합친 뒤에 올린다. */
    reset: (): void => {
      merged = false;
    },
  };
}
