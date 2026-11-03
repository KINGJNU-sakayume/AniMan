// src/lib/progress/clock.ts
// 시각 찍기의 바닥값. 마지막으로 본 서버 written_at 을 기억해 두었다가, 새 at 이 그보다 +1ms 이상이 되게 한다
// (life-hub docs/P6_SYNC.md 6절: at = max(지금, 서버 written_at + 1ms)). 시계가 느린 기기가
// 이미 본 것보다 "이전"을 찍지 못하게 한다.
import { readJson, writeJson } from '../storage';

export const CLOCK_FLOOR_KEY = 'animan:progress:clock-floor:v1';

export const getClockFloor = (): number => {
  const v = readJson(CLOCK_FLOOR_KEY);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** 서버가 알려준 written_at(ISO)을 반영한다. 더 작은 값으로는 되돌리지 않는다. */
export const raiseClockFloor = (writtenAt: unknown): void => {
  const ms = typeof writtenAt === 'string' ? Date.parse(writtenAt) : NaN;
  if (Number.isFinite(ms) && ms > getClockFloor()) writeJson(CLOCK_FLOOR_KEY, ms);
};

/**
 * 문서의 F: 이 기기가 본 가장 늦은 서버 written_at(ms). 한 번도 본 적이 없으면 null.
 * 180일 넘게 쉰 기기의 검토가 "마지막 동기화 이후 바뀌지 않은 항목"(at ≤ F)을 가려내는 기준이다.
 */
export const readClockFloor = (): number | null => {
  const floor = getClockFloor();
  return floor > 0 ? floor : null;
};
