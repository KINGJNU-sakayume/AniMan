// src/hooks/useHashRoute.ts
// GitHub Pages 는 서버 리라이트가 없으므로 해시 라우팅을 쓴다.
// 뒤로 가기/새로고침/링크 공유가 동작하고, 목록으로 돌아오면 스크롤 위치가 복원된다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type Route =
  | { name: 'landing' }
  | { name: 'series'; seriesId: string }
  | { name: 'admin' };

export const routeHref = {
  landing: '#/',
  series: (seriesId: string) => `#/series/${encodeURIComponent(seriesId)}`,
  admin: '#/admin',
};

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const series = /^\/series\/([^/?#]+)/.exec(path);
  if (series) return { name: 'series', seriesId: decodeURIComponent(series[1]) };
  if (/^\/admin\/?$/.test(path)) return { name: 'admin' };
  return { name: 'landing' };
}

const scrollPositions = new Map<string, number>();
let nextScroll: 'top' | 'restore' = 'restore';

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = (event: HashChangeEvent) => {
      // DOM 이 아직 이전 화면이므로 지금 스크롤 값이 곧 이전 화면의 위치다.
      scrollPositions.set(new URL(event.oldURL).hash, window.scrollY);
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /** 앱 안에서의 이동: 새 화면은 맨 위에서 시작한다. (뒤로/앞으로 가기는 위치 복원) */
  const navigate = useCallback((href: string) => {
    if (href === window.location.hash || (href === '#/' && window.location.hash === '')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    nextScroll = 'top';
    window.location.hash = href;
  }, []);

  const route = useMemo(() => parseHash(hash), [hash]);
  return { route, hash, navigate };
}

/** 화면이 바뀐 직후(페인트 전) 스크롤을 맨 위로 보내거나 이전 위치로 복원한다. */
export function useRouteScroll(hash: string) {
  useLayoutEffect(() => {
    const target = nextScroll === 'restore' ? scrollPositions.get(hash) ?? 0 : 0;
    nextScroll = 'restore';
    window.scrollTo({ top: target, behavior: 'instant' });
  }, [hash]);
}
