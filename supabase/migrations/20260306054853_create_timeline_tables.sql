/*
  # AniMan Timeline Tracker — DB Schema
  
  C-01: 테이블명을 앱 코드와 일치하도록 수정
    - anime_series    → series
    - anime_episodes  → episodes
    - manga_volumes   → volumes
    - episode_manga_mappings → (제거, 앱에서 chapter 범위로 직접 매핑)
    - seasons 테이블 신규 추가
  
  H-01: series 테이블에 youtube_bgm_id 컬럼 추가
  H-02: seasons.end_chapter / end_chapter nullable 허용 (미완결 시즌 지원)
  H-04: ON DELETE CASCADE 명시 — series 삭제 시 연관 레코드 자동 정리
  
  보안:
    - RLS 활성화 (모든 테이블)
    - anon 읽기 허용, 쓰기는 authenticated만
*/

-- ── series ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        UNIQUE NOT NULL,
  description text,
  cover_url   text,
  banner_url  text,
  accent_color text       NOT NULL DEFAULT '#03acb1',
  youtube_bgm_id text,                          -- H-01: BGM ID 컬럼
  created_at  timestamptz DEFAULT now()
);

-- ── seasons ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id     uuid    NOT NULL REFERENCES series(id) ON DELETE CASCADE,  -- H-04
  name          text    NOT NULL,
  start_chapter integer NOT NULL,
  end_chapter   integer,             -- H-02: nullable — 미완결 시즌 허용
  created_at    timestamptz DEFAULT now()
);

-- ── episodes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS episodes (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id      uuid    NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  episode_number text    NOT NULL,   -- text로 'OVA', 'Movie' 등 지원
  title          text,
  start_chapter  integer NOT NULL,
  end_chapter    integer NOT NULL,
  cover_url      text,
  duration       integer,            -- 분 단위
  created_at     timestamptz DEFAULT now(),
  UNIQUE(series_id, episode_number)
);

-- ── volumes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS volumes (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id     uuid    NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  volume_number integer NOT NULL,
  start_chapter integer NOT NULL,
  end_chapter   integer NOT NULL,
  cover_url     text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(series_id, volume_number)
);

-- ── RLS 활성화 ────────────────────────────────────────────────────────────────
ALTER TABLE series   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE volumes  ENABLE ROW LEVEL SECURITY;

-- ── 읽기: 누구나 (anon + authenticated) ──────────────────────────────────────
CREATE POLICY "public read series"   ON series   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read seasons"  ON seasons  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read episodes" ON episodes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read volumes"  ON volumes  FOR SELECT TO anon, authenticated USING (true);

-- ── 쓰기: authenticated만 (C-03 보완 — RLS 레벨 방어) ────────────────────────
CREATE POLICY "auth insert series"   ON series   FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth insert seasons"  ON seasons  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth insert episodes" ON episodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth insert volumes"  ON volumes  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth delete series"   ON series   FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth delete seasons"  ON seasons  FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth delete episodes" ON episodes FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth delete volumes"  ON volumes  FOR DELETE TO authenticated USING (true);

-- ── 인덱스 ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_series_created    ON series(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seasons_series    ON seasons(series_id);
CREATE INDEX IF NOT EXISTS idx_episodes_series   ON episodes(series_id);
CREATE INDEX IF NOT EXISTS idx_volumes_series    ON volumes(series_id);
