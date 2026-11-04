import { describe, expect, it } from 'vitest';
import { formatSyncTime, lifeHubView } from './status';
import type { SyncPhase } from './syncController';

const NOW = new Date(2026, 10, 4, 15, 30).getTime();
const view = (phase: SyncPhase, opts: { connected?: boolean; lost?: boolean; lastSyncAt?: number | null } = {}) =>
  lifeHubView({ connected: opts.connected ?? true, lost: opts.lost ?? false, snap: { phase, lastSyncAt: opts.lastSyncAt ?? null }, now: NOW });

describe('formatSyncTime', () => {
  it('today → 오늘 HH:MM, otherwise M월 D일 HH:MM', () => {
    expect(formatSyncTime(new Date(2026, 10, 4, 9, 5).getTime(), NOW)).toBe('오늘 09:05');
    expect(formatSyncTime(new Date(2026, 10, 3, 23, 59).getTime(), NOW)).toBe('11월 3일 23:59');
    expect(formatSyncTime(new Date(2025, 10, 4, 9, 5).getTime(), NOW)).toBe('11월 4일 09:05');
  });
});

describe('lifeHubView (A / B / C)', () => {
  it('not connected → A; connection refused in this session → C', () => {
    expect(view('off', { connected: false })).toEqual({ state: 'A' });
    expect(view('not_connected', { connected: false })).toEqual({ state: 'A' });
    expect(view('not_connected')).toEqual({ state: 'A' });
    expect(view('not_connected', { connected: false, lost: true })).toMatchObject({ state: 'C', cause: 'disconnected' });
  });

  it('connected and running → B with the status line', () => {
    expect(view('idle')).toMatchObject({ state: 'B', text: '연결됨 · 아직 동기화 전' });
    expect(view('idle', { lastSyncAt: new Date(2026, 10, 4, 8, 0).getTime() })).toMatchObject({ state: 'B', text: '연결됨 · 오늘 08:00 동기화' });
    expect(view('syncing')).toMatchObject({ state: 'B', text: '연결됨 · 동기화 중…' });
    expect(view('retry')).toMatchObject({ state: 'B', text: '연결됨 · 잠시 뒤 다시 시도' });
    // "off" while connected is being switched on: drawn as B, never as A
    expect(view('off')).toMatchObject({ state: 'B' });
  });

  it('things the owner must act on → C with the cause', () => {
    for (const phase of ['no_permission', 'needs_review', 'too_large', 'error'] as const) {
      expect(view(phase)).toMatchObject({ state: 'C', cause: phase });
    }
  });
});
