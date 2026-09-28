// src/lib/timelineLayout.ts
// 챕터 범위 → 픽셀 위치 변환. PC(가로)와 모바일(세로) 타임라인이 같은 계산을 공유한다.

export interface ChapterSpan {
  startChapter: number;
  endChapter: number | null;
}

export type Placed<T> = T & { actualStart: number; actualEnd: number };

/**
 * 챕터 범위를 타임라인 좌표로 바꾼다. 이웃 항목과 경계 챕터를 공유하면 0.5씩 나눠 가진다.
 * endChapter가 null인 항목(연재 중인 시즌)은 openEnd까지 늘린다. 입력은 startChapter 순이어야 한다.
 */
export function placeOnTimeline<T extends ChapterSpan>(items: readonly T[], openEnd?: number): Placed<T>[] {
  const withEnd = items
    .map((item) => ({ item, end: item.endChapter ?? openEnd ?? null }))
    .filter((entry): entry is { item: T; end: number } => entry.end != null && entry.end >= entry.item.startChapter);

  return withEnd.map(({ item, end }, i) => {
    let actualStart = item.startChapter;
    let actualEnd = end + 1;
    if (i > 0 && withEnd[i - 1].end === item.startChapter) actualStart += 0.5;
    if (i < withEnd.length - 1 && withEnd[i + 1].item.startChapter === end) actualEnd -= 0.5;
    return { ...item, actualStart, actualEnd };
  });
}

export interface TimelineLayout {
  milestones: number[];
  offsets: number[];
  total: number;
  indexOf: Map<number, number>;
}

/**
 * 모든 경계점(milestone) 사이 구간의 길이를 정한다. 각 에피소드/단행본이 최소 크기
 * (minEpisode / minVolume) 이상을 확보하도록 구간마다 가장 큰 요구치를 채택한다.
 */
export function buildLayout(
  spans: ReadonlyArray<{ actualStart: number; actualEnd: number }>,
  episodes: ReadonlyArray<{ actualStart: number; actualEnd: number }>,
  volumes: ReadonlyArray<{ actualStart: number; actualEnd: number }>,
  minEpisode: number,
  minVolume: number,
): TimelineLayout {
  const points = new Set<number>();
  spans.forEach((s) => { points.add(s.actualStart); points.add(s.actualEnd); });
  const milestones = Array.from(points).sort((a, b) => a - b);

  const offsets = [0];
  let total = 0;
  for (let i = 0; i < milestones.length - 1; i++) {
    const segStart = milestones[i];
    const segEnd = milestones[i + 1];
    const segLen = segEnd - segStart;
    let size = 0;
    for (const ep of episodes) {
      if (ep.actualStart <= segStart && ep.actualEnd >= segEnd) {
        size = Math.max(size, (segLen / (ep.actualEnd - ep.actualStart)) * minEpisode);
      }
    }
    for (const vol of volumes) {
      if (vol.actualStart <= segStart && vol.actualEnd >= segEnd) {
        size = Math.max(size, (segLen / (vol.actualEnd - vol.actualStart)) * minVolume);
      }
    }
    total += size || minEpisode;
    offsets.push(total);
  }

  return { milestones, offsets, total, indexOf: new Map(milestones.map((m, i) => [m, i])) };
}

/** 항목의 시작 위치(pos)와 크기(dim, 간격 제외) */
export function placeSpan(
  layout: TimelineLayout,
  actualStart: number,
  actualEnd: number,
  fallbackDim: number,
  gap: number,
): { pos: number; dim: number } {
  const si = layout.indexOf.get(actualStart);
  const ei = layout.indexOf.get(actualEnd);
  if (si == null || ei == null || si >= ei) {
    return { pos: si != null ? layout.offsets[si] ?? 0 : 0, dim: fallbackDim - gap };
  }
  return { pos: layout.offsets[si], dim: layout.offsets[ei] - layout.offsets[si] - gap };
}
