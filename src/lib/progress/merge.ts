// src/lib/progress/merge.ts
// 진행 기록 v2 병합 — 순수 함수. 시계·저장소·네트워크를 읽지 않는다.
//
// 항목마다 Last-Writer-Wins(LWW, 마지막 쓰기 우선): at 이 더 늦은 쪽이 이긴다.
// at 이 같으면 done:true 가 이긴다(추가가 더 가벼운 잘못). at 은 문자열이 아니라 Date.parse 값으로 비교한다.
// 항목 하나의 승자는 (시각, done) 의 전순서 최댓값이라 교환·결합·멱등 법칙이 성립한다.
// 묘비 정리는 now 에 의존하므로 여기서 하지 않는다(model.pruneTombstones, 쓰기 직전에만).
import { normalizeV2, parseAt, type ItemEntry, type ProgressV2 } from './model';

const winner = (a: ItemEntry, b: ItemEntry): ItemEntry => {
  const ta = parseAt(a.at) ?? Number.NEGATIVE_INFINITY;
  const tb = parseAt(b.at) ?? Number.NEGATIVE_INFINITY;
  if (ta !== tb) return ta > tb ? a : b;
  if (a.done !== b.done) return a.done ? a : b;
  return a;
};

/** 두 v2 진행 기록의 합. 입력은 정규화되어 있어도 아니어도 된다(해석 못 하는 항목은 버린다). */
export const mergeProgressV2 = (a: unknown, b: unknown): ProgressV2 => {
  const left = normalizeV2(a) ?? {};
  const right = normalizeV2(b) ?? {};
  const out: ProgressV2 = {};
  for (const seriesId of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const x = left[seriesId] ?? {};
    const y = right[seriesId] ?? {};
    const items: Record<string, ItemEntry> = {};
    for (const itemId of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const ex = x[itemId];
      const ey = y[itemId];
      const picked = ex && ey ? winner(ex, ey) : (ex ?? ey);
      items[itemId] = { done: picked.done, at: picked.at };
    }
    out[seriesId] = items;
  }
  return out;
};
