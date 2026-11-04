// src/hooks/useLifeHub.ts
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { bootHub, getHubState, subscribeHub, type HubState } from '../lifehub/hub';
import { lifeHubView, type LifeHubView } from '../lifehub/status';
import { syncController, type SyncSnapshot } from '../lifehub/syncController';

export const useHub = (): HubState => useSyncExternalStore(subscribeHub, getHubState, getHubState);

export const useSyncSnapshot = (): SyncSnapshot => {
  const controller = syncController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
};

/** 설정 › Life Hub 의 공통 상태(A/B/C). */
export const useLifeHubView = (): LifeHubView => {
  const hub = useHub();
  const snap = useSyncSnapshot();
  return lifeHubView({ connected: hub.connected, lost: hub.lost, snap, now: Date.now() });
};

/**
 * App 수준: 기기 동기화 리스너를 켜고(시작·탭 복귀 시 가져오고 변경 후·탭 숨김 시 올림), 연결 콜백을 마무리하고,
 * 제안을 가져온다. 연결 콜백이 끝나면 onConnected(설정 시트 열기)를 부른다.
 */
export function useLifeHubBoot(onConnected: () => void): void {
  const callback = useRef(onConnected);
  callback.current = onConnected;
  useEffect(() => syncController().start(), []);
  useEffect(() => {
    let active = true;
    void bootHub().then((done) => {
      if (active && done) callback.current();
    });
    return () => {
      active = false;
    };
  }, []);
}
