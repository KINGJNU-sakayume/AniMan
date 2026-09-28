// src/components/timeline/model.ts
import { useMemo } from 'react';
import { buildLayout, placeOnTimeline, type Placed, type TimelineLayout } from '../../lib/timelineLayout';
import type { Episode, Season, TimelineData, Volume } from '../../types';

export interface TimelineModel {
  episodes: Placed<Episode>[];
  volumes: Placed<Volume>[];
  seasons: Placed<Season>[];
}

/** 에피소드·단행본·시즌을 타임라인 좌표로 배치한다(PC/모바일 공용). */
export function useTimelineModel(data: TimelineData): TimelineModel {
  return useMemo(() => {
    const episodes = placeOnTimeline(data.episodes);
    const volumes = placeOnTimeline(data.volumes);
    // 연재 중(끝 챕터 미정) 시즌은 현재 알려진 마지막 챕터까지 표시한다.
    const lastChapter = Math.max(0, ...data.episodes.map((e) => e.endChapter), ...data.volumes.map((v) => v.endChapter));
    const seasons = placeOnTimeline(data.seasons, lastChapter);
    return { episodes, volumes, seasons };
  }, [data]);
}

export function useLayout(model: TimelineModel, minEpisode: number, minVolume: number): TimelineLayout {
  return useMemo(
    () => buildLayout([...model.seasons, ...model.episodes, ...model.volumes], model.episodes, model.volumes, minEpisode, minVolume),
    [model, minEpisode, minVolume],
  );
}
