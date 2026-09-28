// src/hooks/useHoverMapping.ts
import { useCallback, useMemo, useState } from 'react';
import type { Episode, Volume } from '../types';

const overlaps = (a: { startChapter: number; endChapter: number }, b: { startChapter: number; endChapter: number }) =>
  a.startChapter <= b.endChapter && a.endChapter >= b.startChapter;

/**
 * PC 타임라인의 교차 하이라이트: 에피소드에 마우스를 올리면 같은 챕터를 다루는 단행본을,
 * 단행본에 올리면 해당 에피소드들을 강조한다.
 */
export const useHoverMapping = (episodes: Episode[], volumes: Volume[]) => {
  const [hovered, setHovered] = useState<{ kind: 'episode' | 'volume'; id: string } | null>(null);

  const related = useMemo(() => {
    if (!hovered) return new Set<string>();
    if (hovered.kind === 'episode') {
      const episode = episodes.find((e) => e.id === hovered.id);
      return new Set(episode ? volumes.filter((v) => overlaps(episode, v)).map((v) => v.id) : []);
    }
    const volume = volumes.find((v) => v.id === hovered.id);
    return new Set(volume ? episodes.filter((e) => overlaps(volume, e)).map((e) => e.id) : []);
  }, [hovered, episodes, volumes]);

  const handleEpisodeHover = useCallback((id: string | null) => setHovered(id ? { kind: 'episode', id } : null), []);
  const handleVolumeHover = useCallback((id: string | null) => setHovered(id ? { kind: 'volume', id } : null), []);

  return {
    hoveredId: hovered?.id ?? null,
    related,
    handleEpisodeHover,
    handleVolumeHover,
  };
};
