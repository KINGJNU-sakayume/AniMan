// src/components/timeline/Timeline.tsx
// PC(가로 타임라인)와 모바일(세로 카드) 중 화면에 맞는 하나만 렌더링한다.
// (예전에는 둘 다 렌더링하고 CSS 로 숨겨서 모바일에서도 무거운 PC 트리를 그렸다)
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { DesktopTimeline } from './DesktopTimeline';
import { MobileTimeline } from './MobileTimeline';
import type { MediaKind, TimelineData } from '../../types';

export interface TimelineProps {
  data: TimelineData;
  completedIds: string[];
  onToggle: (id: string) => void;
  onCompleteUpTo: (kind: MediaKind, id: string) => void;
  /** 특정 항목으로 이동 요청 (nonce 로 같은 항목 재요청 구분) */
  focusRequest?: { kind: MediaKind; id: string; nonce: number } | null;
}

export const Timeline = (props: TimelineProps) => {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopTimeline {...props} /> : <MobileTimeline {...props} />;
};
