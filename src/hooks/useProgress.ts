import { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Manages the user's watch/read progress across all series.
 *
 * Progress is stored in the `user_progress` Supabase table as an array of
 * completed episode/volume IDs per series. On mount the full progress map is
 * loaded from the database; individual toggles and bulk completions are persisted
 * via upsert immediately after the local state is updated.
 *
 * @param session - The current Supabase session. Pass `null` when the user is
 *   unauthenticated; the hook will no-op all database operations.
 * @returns
 *   - `completedMap` — A dictionary mapping series IDs to arrays of completed item IDs.
 *   - `toggle` — Adds or removes a single item ID from a series' completed list.
 *   - `bulkComplete` — Adds all IDs in a list to a series' completed set (no duplicates).
 *   - `syncing` — True while a save request is in flight.
 */
export const useProgress = (session: Session | null) => {
  const [completedMap, setCompletedMap] = useState<Record<string, string[]>>({});
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!session) return;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('user_progress')
          .select('series_id, completed_ids');

        if (error) {
          console.error('[useProgress] Failed to load progress:', error.message);
          return;
        }
        if (data) {
          const map: Record<string, string[]> = {};
          data.forEach((row) => { map[row.series_id] = row.completed_ids; });
          setCompletedMap(map);
        }
      } catch (err) {
        console.error('[useProgress] Unexpected error loading progress:', err);
      }
    };
    load();
  }, [session]);

  /**
   * Persists the completed ID list for a series to Supabase via upsert.
   * @param seriesId - The series whose progress is being saved.
   * @param ids - The full updated array of completed item IDs.
   */
  const saveProgress = useCallback(async (
    seriesId: string,
    ids: string[]
  ) => {
    if (!session) return;
    setSyncing(true);
    try {
      const { error } = await supabase.from('user_progress').upsert({
        user_id: session.user.id,
        series_id: seriesId,
        completed_ids: ids,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_id' });
      if (error) {
        console.error('[useProgress] Failed to save progress:', error.message);
      }
    } catch (err) {
      console.error('[useProgress] Unexpected error saving progress:', err);
    } finally {
      setSyncing(false);
    }
  }, [session]);

  /**
   * Toggles a single item's completion status for a given series.
   * @param seriesId - The series the item belongs to.
   * @param itemId - The episode or volume ID to toggle.
   */
  const toggle = useCallback((seriesId: string, itemId: string) => {
    setCompletedMap((prev) => {
      const current = prev[seriesId] ?? [];
      const updated = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      const next = { ...prev, [seriesId]: updated };
      saveProgress(seriesId, updated);
      return next;
    });
  }, [saveProgress]);

  /**
   * Marks all specified item IDs as complete for a given series (union, no duplicates).
   * Used for "right-click to complete up to here" behaviour.
   * @param seriesId - The series the items belong to.
   * @param ids - The array of episode or volume IDs to mark complete.
   */
  const bulkComplete = useCallback((seriesId: string, ids: string[]) => {
    setCompletedMap((prev) => {
      const current = prev[seriesId] ?? [];
      const updated = Array.from(new Set([...current, ...ids]));
      const next = { ...prev, [seriesId]: updated };
      saveProgress(seriesId, updated);
      return next;
    });
  }, [saveProgress]);

  return { completedMap, toggle, bulkComplete, syncing };
};
