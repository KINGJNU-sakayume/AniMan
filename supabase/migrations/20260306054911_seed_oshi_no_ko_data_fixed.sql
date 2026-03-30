/*
  # Seed Oshi no Ko Data
  
  This migration populates the timeline tracker with "Oshi no Ko" anime and manga data.
*/

DO $$
DECLARE
  series_id uuid;
  ep1_id uuid;
  ep2_id uuid;
  ep3_id uuid;
  ep4_id uuid;
  vol1_id uuid;
  vol2_id uuid;
BEGIN
  INSERT INTO anime_series (title, title_localized, synopsis, accent_color)
  VALUES (
    'Oshi no Ko',
    '最愛のアイ',
    'A tragic incident launches the career of an obstetrician into an unexpected direction. Discover the untold stories of the idol industry as told from the perspective of a surgeon with a taste for the theatrical.',
    '#FF1493'
  )
  RETURNING id INTO series_id;

  INSERT INTO anime_episodes (series_id, episode_number, episode_title, duration_minutes)
  VALUES (series_id, 1, 'Mother and Children', 90)
  RETURNING id INTO ep1_id;
  
  INSERT INTO anime_episodes (series_id, episode_number, episode_title, duration_minutes)
  VALUES (series_id, 2, 'Third Option', 24)
  RETURNING id INTO ep2_id;
  
  INSERT INTO anime_episodes (series_id, episode_number, episode_title, duration_minutes)
  VALUES (series_id, 3, 'Manga Based TV Drama', 24)
  RETURNING id INTO ep3_id;
  
  INSERT INTO anime_episodes (series_id, episode_number, episode_title, duration_minutes)
  VALUES (series_id, 4, 'Actors', 24)
  RETURNING id INTO ep4_id;

  INSERT INTO manga_volumes (series_id, volume_number, chapter_start, chapter_end)
  VALUES (series_id, 1, 1, 10)
  RETURNING id INTO vol1_id;
  
  INSERT INTO manga_volumes (series_id, volume_number, chapter_start, chapter_end)
  VALUES (series_id, 2, 11, 19)
  RETURNING id INTO vol2_id;

  INSERT INTO episode_manga_mappings (episode_id, manga_volume_id)
  VALUES
    (ep1_id, vol1_id),
    (ep2_id, vol2_id),
    (ep3_id, vol2_id),
    (ep4_id, vol2_id);
END $$;
