// src/lifehub/status.ts
// 설정 › Life Hub 섹션의 공통 상태(A 연결 전 / B 연결됨 / C 확인 필요)를 연결 여부와 동기화 단계에서 계산한다.
import type { SyncPhase, SyncSnapshot } from './syncController';

/** C의 원인: 연결 끊김(토큰 거부) / 동기화 권한 없음 / 180일 검토 / 문서가 너무 큼 / 요청 오류. */
export type AttentionCause = 'disconnected' | 'no_permission' | 'needs_review' | 'too_large' | 'error';

export type LifeHubView =
  | { state: 'A' }
  | { state: 'B'; text: string; phase: SyncPhase }
  | { state: 'C'; cause: AttentionCause; phase: SyncPhase };

const pad = (n: number) => String(n).padStart(2, '0');

/** 오늘이면 `오늘 HH:MM`, 아니면 `M월 D일 HH:MM` (로컬 시각). */
export function formatSyncTime(ms: number, nowMs: number): string {
  const at = new Date(ms);
  const now = new Date(nowMs);
  const hm = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const today = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return today ? `오늘 ${hm}` : `${at.getMonth() + 1}월 ${at.getDate()}일 ${hm}`;
}

export function lifeHubView(input: {
  connected: boolean;
  /** 이번 세션에 Life Hub가 토큰을 거부해 연결이 끊겼다(사용자가 해제한 것이 아님). */
  lost: boolean;
  snap: Pick<SyncSnapshot, 'phase' | 'lastSyncAt'>;
  now: number;
}): LifeHubView {
  const { connected, lost, snap, now } = input;
  if (!connected) return lost ? { state: 'C', cause: 'disconnected', phase: snap.phase } : { state: 'A' };
  switch (snap.phase) {
    case 'not_connected':
      return lost ? { state: 'C', cause: 'disconnected', phase: snap.phase } : { state: 'A' };
    case 'syncing':
      return { state: 'B', text: '연결됨 · 동기화 중…', phase: snap.phase };
    case 'retry':
      return { state: 'B', text: '연결됨 · 잠시 뒤 다시 시도', phase: snap.phase };
    case 'no_permission':
    case 'needs_review':
    case 'too_large':
    case 'error':
      return { state: 'C', cause: snap.phase, phase: snap.phase };
    case 'off': // 연결 상태에서는 켜짐으로 바뀌는 중이다(앱 시작 시 맞춤) — 평소 상태로 그린다.
    case 'idle':
    default:
      return {
        state: 'B',
        text: snap.lastSyncAt === null ? '연결됨 · 아직 동기화 전' : `연결됨 · ${formatSyncTime(snap.lastSyncAt, now)} 동기화`,
        phase: snap.phase,
      };
  }
}
