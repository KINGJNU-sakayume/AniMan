// src/components/SyncSettings.tsx
// 기기 간 동기화 설정 (Life Hub 메뉴 안). 상태 문구는 고정 문구뿐이다 — 문서 내용·토큰·응답 본문을 보여 주지 않는다.
import { useState, useSyncExternalStore } from 'react';
import { requestImportReview } from '../lib/progress/importReview';
import { browserDeps, isConnected } from '../lifehub/remote';
import { syncController, type SyncPhase } from '../lifehub/syncController';

const small = 'px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40';
const plain = `${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`;

const PHASE_TEXT: Record<SyncPhase, string> = {
  off: '꺼짐',
  not_connected: 'Life Hub 연결 필요',
  idle: '켜짐',
  syncing: '동기화 중…',
  error: '오류',
  no_permission: '권한 없음',
  retry: '나중에 다시 시도',
  too_large: '너무 큼',
  needs_review: '검토 필요',
};

const HELP: Partial<Record<SyncPhase, string>> = {
  not_connected: '먼저 Life Hub에 연결해 주세요.',
  no_permission: '이 연결에는 동기화 권한이 없어요. 다시 연결하면서 동의 화면의 「기기끼리 동기화도 허용」을 체크해 주세요. (제안 가져오기는 그대로 동작해요.)',
  retry: '네트워크나 서버 문제로 동기화하지 못했어요. 이 기기의 기록은 그대로이고, 잠시 뒤 자동으로 다시 시도해요.',
  too_large: '동기화 문서가 너무 커서 자동 동기화를 멈췄어요. 이 기기의 기록은 그대로예요.',
  error: '동기화 요청에 문제가 있어 자동 동기화를 멈췄어요. 이 기기의 기록은 그대로예요. 「기기 동기화 실행」으로 다시 시도할 수 있어요.',
  needs_review: '180일 넘게 동기화하지 않아서 자동으로 합치지 않아요. 「서버 문서 검토」에서 지울 항목과 병합 결과를 확인하고 적용해야 동기화가 다시 시작돼요. 취소하면 그대로예요.',
};

const formatTime = (ms: number | null) => (ms === null ? '아직 없음' : new Date(ms).toLocaleString());

export function SyncSettings({ connected, onReconnect, onClose }: { connected: boolean; onReconnect: () => void; onClose: () => void }) {
  const controller = syncController();
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [label, setLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = snap.phase === 'syncing';

  // 180일 넘게 쉰 기기: 서버 문서를 읽어 계획을 만들고(아무것도 바꾸지 않음) 가져오기 미리보기에서 확인받는다.
  // 취소하면 그대로 「검토 필요」이고, 확인해야만 controller.applyReview 가 지우기·병합·동기화를 한다.
  const review = async () => {
    setNotice(null);
    try {
      const plan = await controller.prepareReview();
      const reasons: string[] = [];
      if (plan.server === null) reasons.push('서버에 동기화 문서가 아직 없어서 아무것도 지우지 않아요.');
      else if (plan.floorMs === null) reasons.push('마지막 동기화 시각을 알 수 없어서 아무것도 지우지 않아요.');
      onClose();
      requestImportReview({
        kind: 'stale',
        fileName: 'Life Hub 동기화 문서',
        remove: plan.remove,
        result: plan.result,
        server: plan.server,
        note: reasons[0],
        onApply: () => controller.applyReview(plan),
      });
    } catch {
      setNotice('서버 문서를 가져오지 못했어요.');
    }
  };

  return (
    <section className="space-y-2 border-t border-zinc-800 pt-3" aria-labelledby="sync-title" data-testid="sync-settings">
      <h3 id="sync-title" className="text-sm font-bold">기기 간 동기화</h3>
      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={snap.enabled}
          disabled={!connected && !snap.enabled}
          onChange={(e) => controller.setEnabled(e.target.checked)}
        />
        이 기기에서 동기화 켜기
      </label>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-zinc-300">
        <dt className="text-zinc-500">상태</dt>
        <dd data-testid="sync-status" data-phase={snap.phase}>{PHASE_TEXT[snap.phase]}</dd>
        <dt className="text-zinc-500">마지막 동기화</dt>
        <dd data-testid="sync-last" data-last={snap.lastSyncAt ?? ''}>{formatTime(snap.lastSyncAt)}</dd>
      </dl>
      {HELP[snap.phase] && <p className="text-xs text-amber-300" data-testid="sync-help">{HELP[snap.phase]}</p>}
      {!connected && !snap.enabled && <p className="text-xs text-zinc-500">Life Hub에 연결하면 켤 수 있어요.</p>}
      {notice && <p role="status" className="text-xs text-zinc-300">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={plain} disabled={!snap.enabled || busy || !isConnected(browserDeps())} onClick={() => controller.request('manual')}>
          {busy ? '동기화 중…' : '기기 동기화 실행'}
        </button>
        {snap.phase === 'no_permission' && (
          <button type="button" className={`${small} bg-indigo-500/20 border-indigo-400/40 text-indigo-100`} onClick={onReconnect}>
            동기화를 허용하며 다시 연결
          </button>
        )}
        {snap.phase === 'needs_review' && (
          <>
            <button type="button" className={plain} onClick={() => void review()}>서버 문서 검토</button>
          </>
        )}
      </div>

      <label className="block text-xs text-zinc-400">
        기기 이름 <span className="text-zinc-500">(영문·숫자 40자까지, 비우면 기본값)</span>
        <input
          type="text"
          maxLength={40}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
          placeholder={snap.effectiveLabel ?? ''}
          value={label ?? snap.customLabel ?? ''}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            if (label !== null) controller.setDeviceLabel(label);
            setLabel(null);
          }}
        />
      </label>
    </section>
  );
}
