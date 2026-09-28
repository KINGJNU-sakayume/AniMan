// src/hooks/useYouTubeBgm.ts
// 배경음악용 YouTube 플레이어. 처음 재생을 누를 때만 IFrame API 를 불러오고(페이지 로드 비용 0),
// 버튼 상태는 플레이어가 알려주는 실제 상태를 따른다(자동재생 차단 시 "재생 중"으로 남지 않음).
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width?: number;
      height?: number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
        onAutoplayBlocked?: () => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const fail = (reason: string) => {
      apiPromise = null;
      reject(new Error(reason));
    };
    const timeout = window.setTimeout(() => fail('YouTube IFrame API timed out'), 10_000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else fail('YouTube IFrame API missing');
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      fail('YouTube IFrame API failed to load');
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export type BgmStatus = 'idle' | 'loading' | 'playing' | 'paused';

const START_TIMEOUT_MS = 6_000;

export function useYouTubeBgm(videoId: string | null) {
  const [status, setStatusState] = useState<BgmStatus>('idle');
  const statusRef = useRef<BgmStatus>('idle');
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const startTimer = useRef<number>();

  const setStatus = useCallback((next: BgmStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const teardown = useCallback(() => {
    window.clearTimeout(startTimer.current);
    playerRef.current?.destroy();
    playerRef.current = null;
    if (hostRef.current) hostRef.current.innerHTML = '';
  }, []);

  useEffect(() => {
    return () => {
      teardown();
      statusRef.current = 'idle';
      setStatusState('idle');
    };
  }, [videoId, teardown]);

  /** 재생을 요청한 뒤 일정 시간 안에 실제로 재생되지 않으면(자동재생 차단 등) 상태를 되돌린다. */
  const watchStart = useCallback(() => {
    window.clearTimeout(startTimer.current);
    startTimer.current = window.setTimeout(() => {
      if (statusRef.current === 'playing') return;
      setStatus(playerRef.current ? 'paused' : 'idle');
      toast('브라우저가 음악 자동 재생을 막았습니다. 한 번 더 눌러 주세요.', { id: 'bgm', icon: '🔇' });
    }, START_TIMEOUT_MS);
  }, [setStatus]);

  const toggle = useCallback(async () => {
    if (!videoId || statusRef.current === 'loading') return;

    const existing = playerRef.current;
    if (existing) {
      if (statusRef.current === 'playing') {
        window.clearTimeout(startTimer.current);
        existing.pauseVideo();
        setStatus('paused');
      } else {
        existing.playVideo();
        watchStart();
      }
      return;
    }

    setStatus('loading');
    try {
      const YT = await loadYouTubeApi();
      if (!hostRef.current) return;
      const mount = document.createElement('div');
      hostRef.current.appendChild(mount);
      playerRef.current = new YT.Player(mount, {
        videoId,
        width: 200,
        height: 200,
        playerVars: {
          autoplay: 1, loop: 1, playlist: videoId, controls: 0, playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => event.target.playVideo(),
          onStateChange: ({ data }) => {
            if (data === YT.PlayerState.PLAYING || data === YT.PlayerState.BUFFERING) {
              window.clearTimeout(startTimer.current);
              setStatus('playing');
            } else if (data === YT.PlayerState.PAUSED) {
              setStatus('paused');
            }
          },
          onError: () => {
            teardown();
            setStatus('idle');
            toast.error('BGM 영상을 재생할 수 없습니다.', { id: 'bgm' });
          },
          onAutoplayBlocked: () => {
            window.clearTimeout(startTimer.current);
            setStatus('paused');
            toast('브라우저가 음악 자동 재생을 막았습니다. 한 번 더 눌러 주세요.', { id: 'bgm', icon: '🔇' });
          },
        },
      });
      watchStart();
    } catch (err) {
      console.error('[useYouTubeBgm]', err);
      setStatus('idle');
      toast.error('BGM 플레이어를 불러오지 못했습니다.', { id: 'bgm' });
    }
  }, [videoId, setStatus, teardown, watchStart]);

  return { status, isPlaying: status === 'playing', toggle, hostRef };
}
