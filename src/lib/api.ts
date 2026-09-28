// src/lib/api.ts
// Supabase 데이터 접근 계층. DB 행(snake_case)은 여기서만 다루고 도메인 타입으로 변환해 내보낸다.
import { supabase } from './supabase';
import { normalizeHex } from './color';
import type {
  AdminEpisodeInput, AdminFormData, AdminSeasonInput, AdminVolumeInput,
  CompletedMap, Episode, Season, Series, SeriesSummary, TimelineData, Volume,
} from '../types';

interface SeriesRow {
  id: string;
  title: string;
  description?: string | null;
  cover_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  youtube_bgm_id?: string | null;
}
interface SeasonRow { id: string; name: string; start_chapter: number; end_chapter: number | null }
interface EpisodeRow {
  id: string; series_id?: string; episode_number: string | number; title?: string | null;
  start_chapter: number; end_chapter: number; cover_url?: string | null; duration?: number | null;
}
interface VolumeRow {
  id: string; series_id?: string; volume_number: number;
  start_chapter: number; end_chapter: number; cover_url?: string | null;
}

const blankToNull = (value: string | null | undefined) => (value && value.trim() ? value : null);

const toSeries = (row: SeriesRow): Series => ({
  id: row.id,
  title: row.title,
  description: blankToNull(row.description),
  coverUrl: blankToNull(row.cover_url),
  bannerUrl: blankToNull(row.banner_url),
  accentColor: normalizeHex(row.accent_color),
  youtubeBgmId: blankToNull(row.youtube_bgm_id),
});

const toSeason = (row: SeasonRow): Season => ({
  id: row.id,
  name: row.name,
  startChapter: Number(row.start_chapter),
  endChapter: row.end_chapter != null ? Number(row.end_chapter) : null,
});

const toEpisode = (row: EpisodeRow): Episode => ({
  id: row.id,
  number: String(row.episode_number),
  title: row.title ?? null,
  startChapter: Number(row.start_chapter),
  endChapter: Number(row.end_chapter),
  coverUrl: blankToNull(row.cover_url),
  duration: row.duration != null ? Number(row.duration) : null,
});

const toVolume = (row: VolumeRow): Volume => ({
  id: row.id,
  number: Number(row.volume_number),
  startChapter: Number(row.start_chapter),
  endChapter: Number(row.end_chapter),
  coverUrl: blankToNull(row.cover_url),
});

function groupBySeries<T extends { series_id?: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    if (!row.series_id) return;
    const list = map.get(row.series_id) ?? [];
    list.push(row);
    map.set(row.series_id, list);
  });
  return map;
}

/** 랜딩용 작품 목록 + 진도 계산에 필요한 에피소드/단행본 id (챕터 순). */
export async function fetchSeriesSummaries(): Promise<SeriesSummary[]> {
  const [seriesRes, episodesRes, volumesRes] = await Promise.all([
    supabase
      .from('series')
      .select('id, title, cover_url, banner_url, accent_color')
      .order('created_at', { ascending: false }),
    supabase
      .from('episodes')
      .select('id, series_id, episode_number, start_chapter')
      .order('start_chapter', { ascending: true }),
    supabase
      .from('volumes')
      .select('id, series_id, volume_number, start_chapter')
      .order('start_chapter', { ascending: true }),
  ]);
  if (seriesRes.error) throw seriesRes.error;
  if (episodesRes.error) throw episodesRes.error;
  if (volumesRes.error) throw volumesRes.error;

  const episodesBySeries = groupBySeries((episodesRes.data ?? []) as EpisodeRow[]);
  const volumesBySeries = groupBySeries((volumesRes.data ?? []) as VolumeRow[]);

  return ((seriesRes.data ?? []) as SeriesRow[]).map((row) => {
    const series = toSeries(row);
    return {
      id: series.id,
      title: series.title,
      coverUrl: series.coverUrl,
      bannerUrl: series.bannerUrl,
      accentColor: series.accentColor,
      episodes: (episodesBySeries.get(row.id) ?? []).map((e) => ({ id: e.id, number: String(e.episode_number) })),
      volumes: (volumesBySeries.get(row.id) ?? []).map((v) => ({ id: v.id, number: Number(v.volume_number) })),
    };
  });
}

/** 한 작품의 시즌·에피소드·단행본 (모두 start_chapter 순). */
export async function fetchTimelineData(seriesId: string): Promise<TimelineData> {
  const [seriesRes, seasonsRes, episodesRes, volumesRes] = await Promise.all([
    supabase.from('series').select('*').eq('id', seriesId).single(),
    supabase.from('seasons').select('*').eq('series_id', seriesId).order('start_chapter', { ascending: true }),
    supabase.from('episodes').select('*').eq('series_id', seriesId).order('start_chapter', { ascending: true }),
    supabase.from('volumes').select('*').eq('series_id', seriesId).order('start_chapter', { ascending: true }),
  ]);
  if (seriesRes.error) throw seriesRes.error;
  if (seasonsRes.error) throw seasonsRes.error;
  if (episodesRes.error) throw episodesRes.error;
  if (volumesRes.error) throw volumesRes.error;

  return {
    series: toSeries(seriesRes.data as SeriesRow),
    seasons: ((seasonsRes.data ?? []) as SeasonRow[]).map(toSeason),
    episodes: ((episodesRes.data ?? []) as EpisodeRow[]).map(toEpisode),
    volumes: ((volumesRes.data ?? []) as VolumeRow[]).map(toVolume),
  };
}

/** 로그인한 사용자의 전체 진도 (RLS 로 본인 행만 조회됨). */
export async function fetchProgress(): Promise<CompletedMap> {
  const { data, error } = await supabase.from('user_progress').select('series_id, completed_ids');
  if (error) throw error;
  const map: CompletedMap = {};
  (data ?? []).forEach((row: { series_id: string; completed_ids: string[] | null }) => {
    map[row.series_id] = row.completed_ids ?? [];
  });
  return map;
}

export async function saveProgress(userId: string, seriesId: string, completedIds: string[]): Promise<void> {
  const { error } = await supabase.from('user_progress').upsert(
    {
      user_id: userId,
      series_id: seriesId,
      completed_ids: completedIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,series_id' },
  );
  if (error) throw error;
}

/**
 * 작품 + 시즌/에피소드/단행본을 한 번에 저장한다. 하위 insert 가 실패하면
 * 방금 만든 series 행을 지워(best-effort 롤백) 고아 데이터를 남기지 않는다.
 * @returns 새 series id
 */
export async function saveAdminData(
  form: AdminFormData,
  episodes: AdminEpisodeInput[],
  volumes: AdminVolumeInput[],
  seasons: AdminSeasonInput[] = [],
): Promise<string> {
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .insert([{
      title: form.title.trim(),
      description: form.description.trim() || null,
      accent_color: normalizeHex(form.accentColor),
      cover_url: form.coverUrl.trim() || null,
      banner_url: form.bannerUrl.trim() || null,
      youtube_bgm_id: form.youtubeBgmId.trim() || null,
    }])
    .select()
    .single();

  if (seriesError) throw seriesError;
  const seriesId: string = series.id;

  try {
    if (seasons.length > 0) {
      const { error } = await supabase.from('seasons').insert(
        seasons.map((s) => ({
          series_id: seriesId,
          name: s.name,
          start_chapter: s.startChapter,
          end_chapter: s.endChapter ?? null,
        })),
      );
      if (error) throw error;
    }

    if (episodes.length > 0) {
      const { error } = await supabase.from('episodes').insert(
        episodes.map((ep) => ({
          series_id: seriesId,
          episode_number: ep.number,
          title: ep.title ?? null,
          start_chapter: ep.startChapter,
          end_chapter: ep.endChapter,
          cover_url: ep.cover_url ?? ep.coverUrl ?? null,
          duration: ep.duration ?? null,
        })),
      );
      if (error) throw error;
    }

    if (volumes.length > 0) {
      const { error } = await supabase.from('volumes').insert(
        volumes.map((vol) => ({
          series_id: seriesId,
          volume_number: vol.number,
          start_chapter: vol.startChapter,
          end_chapter: vol.endChapter,
          cover_url: vol.cover_url ?? vol.coverUrl ?? null,
        })),
      );
      if (error) throw error;
    }

    return seriesId;
  } catch (error) {
    await supabase.from('series').delete().eq('id', seriesId);
    throw error;
  }
}
