// src/lifehub/hub.ts
// Life Hub 연결·제안 상태를 화면 밖에서 가진다. 앱 시작 시 자동 제안 가져오기와 기기 동기화는
// 어떤 대화상자를 렌더하지 않아도 여기서 돈다(App 의 useLifeHubBoot). 화면은 구독만 한다.
import { getCatalog } from '../lib/catalog';
import { markCompleted } from '../lib/progress';
import { autoPlan } from './resolve';
import { syncController } from './syncController';
import {
  autoApplyEnabled, beginConnect, browserDeps, completeStoredCallback, disconnect, isConnected, LifeHubError,
  rememberReceipt, seriesRefs, setAutoApply, sync, type ProgressProposal,
} from './remote';

export interface HubState {
  connected: boolean;
  /** 이번 세션에 Life Hub가 토큰을 거부해 연결이 끊겼다(사용자가 해제한 것과 구별). */
  lost: boolean;
  proposals: ProgressProposal[];
  /** 제안 가져오기 진행 중 */
  busy: boolean;
  /** 마지막 처리 결과·오류 문구(기존 문구) */
  message: string | null;
  autoApply: boolean;
}

const listeners = new Set<() => void>();
let state: HubState = {
  connected: isConnected(browserDeps()),
  lost: false,
  proposals: [],
  busy: false,
  message: null,
  autoApply: autoApplyEnabled(browserDeps()),
};

const set = (patch: Partial<HubState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const getHubState = (): HubState => state;
export const subscribeHub = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** 연결이 사라졌을 때(토큰 거부): 제안을 비우고 동기화 상태도 다시 읽는다. */
const markLost = () => {
  if (!state.connected && state.lost) return;
  set({ connected: false, lost: true, proposals: [] });
  syncController().refresh();
};

/** 제안 가져오기(+ 영수증·거절·참조 목록 전송). 기존 LifeHubMenu.runSync 와 같은 동작. */
export async function runInboxSync(): Promise<void> {
  if (!isConnected(browserDeps())) return;
  set({ busy: true });
  try {
    const deps = browserDeps();
    const catalogNow = getCatalog();
    let result = await sync(deps, seriesRefs(catalogNow));
    // Approved in a Claude card with nothing left to decide: mark it now, then send the receipts right away.
    const marked: string[] = [];
    for (const p of result.proposals) {
      const auto = autoPlan(p, catalogNow, autoApplyEnabled(deps));
      if (!auto) continue;
      markCompleted(auto.series.id, auto.plan.ids);
      rememberReceipt(p.key, auto.series.id, deps);
      marked.push(auto.series.title);
    }
    if (marked.length) {
      result = await sync(deps, seriesRefs(catalogNow));
      set({ message: `Claude에서 승인한 진행 ${marked.length}개를 기록했어요: ${marked.join(', ')}` });
    }
    set({ proposals: result.proposals });
    if (result.conflicts) set({ message: `${result.conflicts}개 제안은 Life Hub와 상태가 달라요. 진행 기록은 그대로예요.` });
  } catch (e) {
    if (e instanceof LifeHubError && e.kind === 'not_connected') markLost();
    set({ message: e instanceof Error ? e.message : '동기화하지 못했어요.' });
  } finally {
    set({ busy: false });
  }
}

/** 「지금 동기화」: 제안 가져오기 다음 기기 동기화 한 번. */
export async function syncNow(): Promise<void> {
  await runInboxSync();
  if (isConnected(browserDeps())) syncController().request('manual');
}

/** 기존 연결 시작 함수 그대로(Life Hub 동의 화면으로 이동). */
export function connect(): void {
  void beginConnect(browserDeps())
    .then((url) => window.location.assign(url))
    .catch((e: unknown) => set({ message: e instanceof Error ? e.message : '연결을 시작하지 못했어요.' }));
}

/** 제안과 동기화를 모두 멈춘다. 이 기기의 기록은 지우지 않는다. */
export function disconnectHub(): void {
  disconnect(browserDeps());
  set({ connected: false, lost: false, proposals: [], message: 'Life Hub 연결을 해제했어요.' });
  syncController().refresh();
}

export function setAutoApplyPref(on: boolean): void {
  setAutoApply(browserDeps(), on);
  set({ autoApply: on });
  if (on) void runInboxSync();
}

/** 제안 하나를 처리했을 때(기록/거절): 목록에서 빼고 결과를 보여 준 뒤 다시 가져온다. */
export function proposalHandled(key: string, message: string): void {
  set({ proposals: state.proposals.filter((p) => p.key !== key), message });
  void runInboxSync();
}

/** One token exchange per page load, even when effects run twice (StrictMode). */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

let booted: Promise<boolean> | null = null;
/**
 * 앱 시작 시 한 번: 연결 콜백을 마무리하고(끝나면 true), 제안을 가져온다. 동기화가 Life Hub 연결이 사라졌다고
 * 알리면(not_connected) 제안 쪽도 끊긴 것으로 표시한다.
 */
export function bootHub(): Promise<boolean> {
  if (booted) return booted;
  const controller = syncController();
  controller.subscribe(() => {
    if (state.connected && controller.getSnapshot().phase === 'not_connected' && !isConnected(browserDeps())) markLost();
  });
  booted = finishCallback()
    .then((done) => {
      if (done) {
        set({ connected: true, lost: false, message: 'Life Hub에 연결했어요.' });
        controller.notifyConnected();
      }
      void runInboxSync();
      return done;
    })
    .catch((e: unknown) => {
      set({ message: e instanceof Error ? e.message : 'Life Hub에 연결하지 못했어요.' });
      return false;
    });
  return booted;
}
