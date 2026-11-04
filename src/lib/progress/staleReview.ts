// src/lib/progress/staleReview.ts
// 180일 넘게 쉰 기기의 검토 규칙 — 순수 함수 (life-hub docs/P6_SYNC.md 7절 "Coming back after 180 days").
//
// 묘비는 180일 뒤 정리되므로, 오래 쉰 기기는 다른 기기에서 이미 지워진 항목을 아직 들고 있을 수 있다.
// 평소처럼 병합하면 그 항목이 서버에 되살아난다. 가져오기는 "더하기"만 하므로 막지 못한다.
// 그래서 검토는 그 항목을 로컬에서 *지우기도* 해야 한다.
//
//  - F: 이 기기가 본 가장 늦은 서버 written_at(ms) = 마지막으로 동기화한 서버 버전의 시각.
//  - "마지막 동기화 이후 바뀌지 않음": 로컬 항목의 at ≤ F. (그 뒤의 로컬 편집은 F+1ms 이상으로 찍힌다.)
//  - "서버에 없음": 서버 문서에 그 시리즈/항목 엔트리가 없다. 묘비(done:false)도 엔트리이므로 "있음"이다
//    (그 경우는 평소 병합이 처리한다).
import { mergeProgressV2 } from './merge';
import { parseAt, type ProgressV2 } from './model';

export interface RemovedItem {
  seriesId: string;
  itemId: string;
  /** 지워지는 로컬 엔트리(done:false 인 묘비도 대상이다) */
  done: boolean;
  at: string;
}

export interface StaleReviewPlan {
  /** 지울 항목. 서버 문서가 없거나 F 를 모르면 비어 있다. */
  remove: RemovedItem[];
  /** 지운 뒤 서버와 병합한 나머지 결과 */
  result: ProgressV2;
}

/** 다른 기기에서 지워진 것으로 보이는 항목: at ≤ F 이고 서버에 엔트리가 없는 로컬 항목(done 여부 무관). */
export const itemsDeletedElsewhere = (local: ProgressV2, server: ProgressV2, floorMs: number): RemovedItem[] => {
  const out: RemovedItem[] = [];
  for (const [seriesId, items] of Object.entries(local)) {
    for (const [itemId, entry] of Object.entries(items)) {
      const at = parseAt(entry.at);
      if (at === null || at > floorMs) continue;
      if (Object.prototype.hasOwnProperty.call(server[seriesId] ?? {}, itemId)) continue;
      out.push({ seriesId, itemId, done: entry.done, at: entry.at });
    }
  }
  return out;
};

/** 항목을 지운다. 묘비는 남기지 않는다. 비게 된 시리즈도 뺀다. */
export const removeItems = (progress: ProgressV2, remove: Pick<RemovedItem, 'seriesId' | 'itemId'>[]): ProgressV2 => {
  const drop = new Map<string, Set<string>>();
  for (const { seriesId, itemId } of remove) (drop.get(seriesId) ?? drop.set(seriesId, new Set()).get(seriesId)!).add(itemId);
  const out: ProgressV2 = {};
  for (const [seriesId, items] of Object.entries(progress)) {
    const gone = drop.get(seriesId);
    const kept = Object.fromEntries(Object.entries(items).filter(([id]) => !gone?.has(id)));
    if (Object.keys(kept).length > 0) out[seriesId] = kept;
  }
  return out;
};

/**
 * 검토 계획. 서버 문서가 있고(server ≠ null) F 를 알 때만 지울 항목을 계산한다.
 * 서버 문서가 없거나(404) F 가 없으면 아무것도 지우지 않고 평소처럼 병합한다.
 */
export const planStaleReview = (local: ProgressV2, server: ProgressV2 | null, floorMs: number | null): StaleReviewPlan => {
  const remove = server && floorMs !== null ? itemsDeletedElsewhere(local, server, floorMs) : [];
  return { remove, result: mergeProgressV2(removeItems(local, remove), server ?? {}) };
};
