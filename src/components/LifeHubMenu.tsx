// src/components/LifeHubMenu.tsx
// Life Hub: Claude가 제안한 시청·독서 진행을 확인하고 기록한다(승인해야 반영, 지우지는 않음).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Sparkles, X } from 'lucide-react';
import { getCatalog, subscribeCatalog, type CatalogEntry } from '../lib/catalog';
import { getProgress, markCompleted, subscribe } from '../lib/progress';
import { findSeries, planProgress } from '../lifehub/resolve';
import {
  beginConnect, browserDeps, completeStoredCallback, connectAvailable, disconnect, isConnected, LifeHubError,
  rejectLocally, rememberReceipt, sync, type ProgressProposal,
} from '../lifehub/remote';

const btn =
  'flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors';
const small = 'px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40';

/** One token exchange per page load, even when effects run twice (StrictMode). */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

const describe = (p: ProgressProposal) => {
  const unit = p.kind === 'episode' ? '화' : '권';
  const season = p.season ? `${p.season}기 ` : '';
  const what = p.upTo !== null ? `${season}${p.upTo}${unit}까지` : `${season}${(p.numbers ?? []).join(', ')}${unit}`;
  return `${p.title} · ${p.kind === 'episode' ? '애니' : '만화'} ${what}`;
};

function ProposalRow({ proposal, catalog, onDone }: {
  proposal: ProgressProposal; catalog: CatalogEntry[]; onDone: (message: string, approved: boolean) => void;
}) {
  const found = findSeries(proposal.title, catalog);
  const [seriesId, setSeriesId] = useState<string | null>(found.exact?.id ?? null);
  const progress = useSyncExternalStore(subscribe, getProgress, getProgress);
  const series = catalog.find((s) => s.id === seriesId) ?? null;
  const plan = series ? planProgress(series, proposal) : null;
  const done = new Set(series ? progress[series.id] ?? [] : []);
  const fresh = plan ? plan.ids.filter((id) => !done.has(id)) : [];
  const range = plan && plan.labels.length ? (plan.labels.length > 1 ? `${plan.labels[0]} ~ ${plan.labels[plan.labels.length - 1]}` : plan.labels[0]) : '';

  return (
    <li className="py-3 border-t border-zinc-800 space-y-2">
      <p className="text-sm font-semibold">{describe(proposal)}</p>
      {proposal.note && <p className="text-xs text-zinc-400">“{proposal.note}”</p>}
      {found.choices.length === 0 ? (
        <p className="text-xs text-amber-300">카탈로그에서 이 작품을 찾지 못했어요. 작품을 추가한 뒤 다시 확인하세요.</p>
      ) : found.choices.length > 1 || !found.exact ? (
        <fieldset className="space-y-1 text-sm">
          <legend className="text-xs text-zinc-400">어느 작품인가요?</legend>
          {found.choices.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input type="radio" name={`lh-${proposal.key}`} checked={seriesId === s.id} onChange={() => setSeriesId(s.id)} />
              {s.title}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-xs text-zinc-400">{found.exact.title}</p>
      )}
      {plan && (
        <p className="text-xs text-zinc-300" data-testid="lifehub-plan">
          {plan.ids.length ? `${range} — 새로 완료 ${fresh.length}개${plan.ids.length - fresh.length ? `, 이미 완료 ${plan.ids.length - fresh.length}개` : ''}` : '표시할 항목이 없어요.'}
          {plan.missing.length > 0 && <span className="block text-amber-300">이 작품에 없는 번호: {plan.missing.join(', ')}</span>}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`${small} bg-indigo-500/20 border-indigo-400/40 text-indigo-100 hover:bg-indigo-500/30`}
          disabled={!series || !plan || plan.ids.length === 0}
          onClick={() => {
            if (!series || !plan) return;
            const added = markCompleted(series.id, plan.ids);
            rememberReceipt(proposal.key, series.id, browserDeps());
            onDone(`${series.title}: ${added.length}개를 완료로 표시했어요.`, true);
          }}
        >
          기록
        </button>
        <button
          type="button"
          className={`${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
          onClick={() => {
            rejectLocally(proposal.key, browserDeps());
            onDone('제안을 거절했어요. 진행 기록은 그대로예요.', false);
          }}
        >
          거절
        </button>
      </div>
    </li>
  );
}

export const LifeHubMenu = () => {
  const catalog = useSyncExternalStore(subscribeCatalog, getCatalog, getCatalog);
  const [connected, setConnected] = useState(() => isConnected(browserDeps()));
  const [proposals, setProposals] = useState<ProgressProposal[]>([]);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    if (!isConnected(browserDeps())) return;
    setSyncing(true);
    try {
      const result = await sync(browserDeps());
      setProposals(result.proposals);
      if (result.conflicts) setMessage(`${result.conflicts}개 제안은 Life Hub와 상태가 달라요. 진행 기록은 그대로예요.`);
    } catch (e) {
      if (e instanceof LifeHubError && e.kind === 'not_connected') {
        setConnected(false);
        setProposals([]);
      }
      setMessage(e instanceof Error ? e.message : '동기화하지 못했어요.');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    finishCallback()
      .then((done) => {
        if (!active) return;
        if (done) {
          setConnected(true);
          setMessage('Life Hub에 연결했어요.');
          setOpen(true);
        }
        void runSync();
      })
      .catch((e: unknown) => {
        if (active) setMessage(e instanceof Error ? e.message : 'Life Hub에 연결하지 못했어요.');
      });
    return () => {
      active = false;
    };
  }, [runSync]);

  const canConnect = connectAvailable(window.location);
  const connect = () =>
    void beginConnect(browserDeps())
      .then((url) => window.location.assign(url))
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : '연결을 시작하지 못했어요.'));

  return (
    <>
      <button type="button" className={`${btn} relative`} onClick={() => setOpen(true)} title="Claude가 제안한 진행 기록">
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Life Hub</span>
        {proposals.length > 0 && (
          <span data-testid="lifehub-count" className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-zinc-950 text-[11px] font-bold leading-[18px] text-center">
            {proposals.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="lifehub-title" className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-3 text-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="lifehub-title" className="text-lg font-bold">Claude가 제안한 진행 기록</h2>
                <p className="text-xs text-zinc-400 mt-1">확인하고 「기록」을 눌러야 반영돼요. 이미 완료한 항목은 지우지 않아요.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {connected ? (
                <>
                  <button type="button" className={`${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`} disabled={syncing} onClick={() => void runSync()}>
                    {syncing ? '동기화 중…' : '지금 동기화'}
                  </button>
                  <button type="button" className={`${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`} onClick={() => { disconnect(browserDeps()); setConnected(false); setProposals([]); setMessage('Life Hub 연결을 해제했어요.'); }}>
                    연결 해제
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={`${small} bg-indigo-500/20 border-indigo-400/40 text-indigo-100`} disabled={!canConnect} onClick={connect}>
                    Life Hub 연결
                  </button>
                  {!canConnect && <p className="text-xs text-zinc-500">배포된 주소에서만 연결할 수 있어요.</p>}
                </>
              )}
            </div>

            {message && <p role="status" className="text-xs text-zinc-300">{message}</p>}
            {connected && proposals.length === 0 && !syncing && <p className="text-sm text-zinc-500">검토할 제안이 없어요.</p>}
            {proposals.length > 0 && (
              <ul>
                {proposals.map((p) => (
                  <ProposalRow
                    key={p.key}
                    proposal={p}
                    catalog={catalog}
                    onDone={(text) => {
                      setProposals((old) => old.filter((x) => x.key !== p.key));
                      setMessage(text);
                      void runSync();
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
};
