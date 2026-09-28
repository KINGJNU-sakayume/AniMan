// src/components/timeline/SeasonBars.tsx
// 모바일 비교 보기의 에피소드 열 왼쪽에 시즌 구간을 세로 막대로 표시한다.
import { placeSpan, type Placed, type TimelineLayout } from '../../lib/timelineLayout';
import type { Season } from '../../types';

export const SEASON_INDENT = 18;
const BAR_WIDTH = 3;
const OPACITIES = [1, 0.55, 0.8, 0.45, 0.7];

interface SeasonBarsProps {
  seasons: Placed<Season>[];
  layout: TimelineLayout;
  accentColor: string;
  minHeight: number;
  gap: number;
  /** sticky 배지가 멈출 위치(헤더 높이 + 여유) */
  stickyTop: number;
}

export const SeasonBars = ({ seasons, layout, accentColor, minHeight, gap, stickyTop }: SeasonBarsProps) => (
  <div className="absolute top-0 left-0 bottom-0 pointer-events-none" style={{ width: SEASON_INDENT }} aria-hidden="true">
    {seasons.map((season, idx) => {
      const { pos, dim } = placeSpan(layout, season.actualStart, season.actualEnd, minHeight, gap);
      const opacity = OPACITIES[idx % OPACITIES.length];
      return (
        <div key={season.id} className="absolute left-0" style={{ top: pos, height: dim, width: SEASON_INDENT }}>
          <div className="absolute top-0 bottom-0 left-0 rounded-full" style={{ width: BAR_WIDTH, backgroundColor: accentColor, opacity }} />
          <div className="sticky" style={{ top: stickyTop }}>
            <div
              className="absolute flex items-center justify-center rounded-sm"
              style={{
                left: BAR_WIDTH / 2,
                transform: 'translateX(-50%)',
                top: 4,
                width: SEASON_INDENT - 2,
                padding: '4px 2px',
                backgroundColor: '#09090b',
                border: `1px solid ${accentColor}`,
                opacity,
              }}
            >
              <span
                className="font-black"
                style={{ color: accentColor, fontSize: 10, writingMode: 'vertical-rl', lineHeight: 1, letterSpacing: '0.05em' }}
              >
                {season.name}
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);
