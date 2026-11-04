// src/components/LifeHubSettings.tsx
// 설정 › Life Hub 섹션(공통 규격). 연결·해제·「지금 동기화」는 앱 전체에서 여기에만 있다.
// 상태 문구는 고정 문구뿐이다 — 문서 내용·토큰·응답 본문을 보여 주지 않는다.
import { useState } from 'react';
import { requestImportReview } from '../lib/progress/importReview';
import { connectAvailable } from '../lifehub/remote';
import { connect, disconnectHub, setAutoApplyPref, syncNow } from '../lifehub/hub';
import type { AttentionCause } from '../lifehub/status';
import { syncController } from '../lifehub/syncController';
import { useHub, useLifeHubView, useSyncSnapshot } from '../hooks/useLifeHub';

const small = 'px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40';
const plain = `${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`;
const primary = `${small} bg-indigo-500/20 border-indigo-400/40 text-indigo-100`;

const CAUSE_TEXT: Record<AttentionCause, string> = {
  disconnected: 'Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.',
  no_permission: '동기화 권한이 없는 연결입니다. 한 번 다시 연결하면 제안과 동기화가 함께 켜집니다.',
  needs_review:
    '180일 넘게 동기화하지 않아서 자동으로 합치지 않아요. 「서버 문서 검토」에서 지울 항목과 병합 결과를 확인하고 적용해야 동기화가 다시 시작돼요. 취소하면 그대로예요.',
  too_large: '동기화 문서가 너무 커서 자동 동기화를 멈췄어요. 이 기기의 기록은 그대로예요.',
  error: '동기화 요청에 문제가 있어 자동 동기화를 멈췄어요. 이 기기의 기록은 그대로예요. 「지금 동기화」로 다시 시도할 수 있어요.',
};

const Dot = ({ warn }: { warn?: boolean }) => (
  <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${warn ? 'bg-amber-400' : 'bg-emerald-400'}`} />
);

export function LifeHubSettings({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const snap = useSyncSnapshot();
  const view = useLifeHubView();
  const [label, setLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = hub.busy || snap.phase === 'syncing';
  const canConnect = connectAvailable(window.location);

  // 180일 넘게 쉰 기기: 서버 문서를 읽어 계획을 만들고(아무것도 바꾸지 않음) 가져오기 미리보기에서 확인받는다.
  // 취소하면 그대로 「확인 필요」이고, 확인해야만 controller.applyReview 가 지우기·병합·동기화를 한다.
  const review = async () => {
    setNotice(null);
    const controller = syncController();
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

  const syncButton = (
    <button type="button" className={plain} disabled={busy} onClick={() => void syncNow()}>
      지금 동기화
    </button>
  );
  const disconnectButton = (
    <button type="button" className={plain} onClick={disconnectHub}>
      연결 해제
    </button>
  );
  const messages = (
    <>
      {hub.message && <p role="status" className="text-xs text-zinc-400">{hub.message}</p>}
      {notice && <p role="status" className="text-xs text-zinc-300">{notice}</p>}
    </>
  );

  return (
    <section className="space-y-3" aria-labelledby="lifehub-settings-title" data-testid="lifehub-settings">
      <h3 id="lifehub-settings-title" className="text-sm font-bold">Life Hub</h3>

      {view.state === 'A' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Claude가 제안한 기록을 받고, 이 앱의 기록을 다른 기기와 맞춥니다.</p>
          <button type="button" className={primary} disabled={!canConnect} onClick={connect}>
            Life Hub 연결
          </button>
          {!canConnect && <p className="text-xs text-zinc-500">배포된 주소에서만 연결할 수 있어요.</p>}
          {messages}
        </div>
      )}

      {view.state === 'B' && (
        <div className="space-y-3">
          <p
            className="flex items-center gap-2 text-sm text-zinc-200"
            data-testid="sync-status"
            data-phase={view.phase}
            data-last={snap.lastSyncAt ?? ''}
          >
            <Dot />
            {view.text}
          </p>
          {messages}
          <div className="flex flex-wrap gap-2">
            {syncButton}
            {disconnectButton}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={hub.autoApply} onChange={(e) => setAutoApplyPref(e.target.checked)} />
            Claude에서 승인한 기록은 바로 반영 <span className="text-zinc-500">(작품과 번호가 정확할 때만)</span>
          </label>
          <details className="text-xs text-zinc-400">
            <summary className="cursor-pointer select-none text-zinc-300">고급</summary>
            <label className="mt-2 block">
              기기 이름 <span className="text-zinc-500">(영문·숫자 40자까지, 비우면 기본값)</span>
              <input
                type="text"
                maxLength={40}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                placeholder={snap.effectiveLabel ?? ''}
                value={label ?? snap.customLabel ?? ''}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => {
                  if (label !== null) syncController().setDeviceLabel(label);
                  setLabel(null);
                }}
              />
            </label>
          </details>
        </div>
      )}

      {view.state === 'C' && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-amber-300" data-testid="sync-status" data-phase={view.phase} data-last={snap.lastSyncAt ?? ''}>
            <Dot warn />
            확인 필요
          </p>
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3" data-testid="lifehub-attention">
            <p className="text-xs text-amber-200">{CAUSE_TEXT[view.cause]}</p>
            {(view.cause === 'disconnected' || view.cause === 'no_permission') && (
              <button type="button" className={primary} disabled={!canConnect} onClick={connect}>
                다시 연결
              </button>
            )}
            {(view.cause === 'disconnected' || view.cause === 'no_permission') && !canConnect && (
              <p className="text-xs text-zinc-500">배포된 주소에서만 연결할 수 있어요.</p>
            )}
            {view.cause === 'needs_review' && (
              <button type="button" className={plain} onClick={() => void review()}>
                서버 문서 검토
              </button>
            )}
            {view.cause === 'error' && syncButton}
          </div>
          {messages}
          {view.cause !== 'disconnected' && <div className="flex flex-wrap gap-2">{disconnectButton}</div>}
        </div>
      )}
    </section>
  );
}
