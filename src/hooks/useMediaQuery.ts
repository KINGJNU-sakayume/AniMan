// src/hooks/useMediaQuery.ts
import { useCallback, useSyncExternalStore } from 'react';

/** CSS 미디어 쿼리 일치 여부. PC/모바일 트리 중 하나만 렌더링하는 데 쓴다. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Tailwind `md` 브레이크포인트와 동일 */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
