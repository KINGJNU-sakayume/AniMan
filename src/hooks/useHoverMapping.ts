// src/hooks/useHoverMapping.ts
import { useState, useMemo } from 'react';
import type { Episode, Volume } from '../types';

/** Shape of data required by the hook. */
interface HoverMappingData {
  episodes: Episode[];
  volumes: Volume[];
}

/**
 * Computes cross-media hover highlights for the timeline.
 *
 * When the user hovers an episode node, this hook identifies which manga volumes
 * overlap the same chapter range, and vice versa. The resulting ID arrays are
 * used by `TimelineNode` to apply a "related" visual highlight.
 *
 * @param data - An object containing the full `episodes` and `volumes` arrays for
 *   the current series, or null when no series is loaded.
 * @returns
 *   - `hoveredEpisodeId` — The ID of the currently hovered episode, or null.
 *   - `hoveredVolumeId` — The ID of the currently hovered volume, or null.
 *   - `relatedVolumes` — Volume IDs whose chapter range overlaps the hovered episode.
 *   - `relatedEpisodes` — Episode IDs whose chapter range overlaps the hovered volume.
 *   - `handleEpisodeHover` — Call with an episode ID (or null) on mouseenter/mouseleave.
 *   - `handleVolumeHover` — Call with a volume ID (or null) on mouseenter/mouseleave.
 */
export const useHoverMapping = (data: HoverMappingData | null) => {
  const [hoveredEpisodeId, setHoveredEpisodeId] = useState<string | null>(null);
  const [hoveredVolumeId, setHoveredVolumeId] = useState<string | null>(null);

  // 에피소드에 마우스 올렸을 때 → 겹치는 볼륨 ID 목록
  const relatedVolumes = useMemo(() => {
    if (!data || !hoveredEpisodeId) return [];
    const episode = data.episodes.find((e) => e.id === hoveredEpisodeId);
    if (!episode) return [];
    return data.volumes
      .filter((v) => episode.startChapter <= v.endChapter && episode.endChapter >= v.startChapter)
      .map((v) => v.id);
  }, [hoveredEpisodeId, data]);

  // 볼륨에 마우스 올렸을 때 → 겹치는 에피소드 ID 목록
  const relatedEpisodes = useMemo(() => {
    if (!data || !hoveredVolumeId) return [];
    const volume = data.volumes.find((v) => v.id === hoveredVolumeId);
    if (!volume) return [];
    return data.episodes
      .filter((e) => volume.startChapter <= e.endChapter && volume.endChapter >= e.startChapter)
      .map((e) => e.id);
  }, [hoveredVolumeId, data]);

  const handleEpisodeHover = (episodeId: string | null) => {
    setHoveredEpisodeId(episodeId);
    setHoveredVolumeId(null);
  };

  const handleVolumeHover = (volumeId: string | null) => {
    setHoveredVolumeId(volumeId);
    setHoveredEpisodeId(null);
  };

  return {
    hoveredEpisodeId,
    hoveredVolumeId,
    relatedVolumes,
    relatedEpisodes,
    handleEpisodeHover,
    handleVolumeHover,
  };
};
