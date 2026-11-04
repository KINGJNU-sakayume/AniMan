/**
 * When to sync (life-hub docs/P6_SYNC.md, section 7): pull on app start and when the tab becomes visible, push a few
 * seconds after a change (debounced) and when the tab is hidden, never poll. One pass at a time; failures back off
 * exponentially with a cap. Everything about *how* a pass works is in sync.ts.
 */
import { onExternalChange } from '../lib/storage';
import { readClockFloor } from '../lib/progress/clock';
import { planStaleReview, type StaleReviewPlan } from '../lib/progress/staleReview';
import type { ProgressV2 } from '../lib/progress/model';
import { applyRemote, applyStaleReview, getProgressV2, subscribe } from '../lib/progress/store';
import { isConnected, mayHaveSyncScope, browserDeps, type Deps } from './remote';
import {
  defaultDeviceLabel, fetchServerDocument, needsReview, readState, runSync, sanitizeDeviceLabel, STATE_KEY, updateState, type SyncHost, type SyncOutcome,
} from './sync';

export const DEBOUNCE_MS = 5_000;
export const BACKOFF_BASE_MS = 10_000;
export const BACKOFF_MAX_MS = 10 * 60_000;

export type SyncPhase =
  | 'off' | 'not_connected' | 'idle' | 'syncing' | 'error' | 'no_permission' | 'retry' | 'too_large' | 'needs_review';

export interface SyncSnapshot {
  phase: SyncPhase;
  enabled: boolean;
  lastSyncAt: number | null;
  /** The label the owner typed, or null when the default is used. */
  customLabel: string | null;
  /** What is sent as X-Device-Label (null = header omitted). */
  effectiveLabel: string | null;
}

/** What the stale-device review shows and, once the owner confirms, applies. */
export interface ReviewPlan extends StaleReviewPlan {
  /** The server document, or null when there is none yet (404). */
  server: ProgressV2 | null;
  /** F as it was before the review fetched anything; null when this device never saw a server time. */
  floorMs: number | null;
}

export type SyncReason = 'start' | 'visible' | 'hidden' | 'change' | 'manual';

export interface ControllerOptions {
  deps: Deps;
  host: SyncHost;
  /** Calls `listener` whenever local progress changes; returns an unsubscribe function. */
  onLocalChange: (listener: () => void) => () => void;
  userAgent?: string;
}

export function createSyncController({ deps, host, onLocalChange, userAgent = '' }: ControllerOptions) {
  const listeners = new Set<() => void>();
  let running = false;
  let again = false;
  let applying = false;
  let retryPending = false;
  let failures = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: SyncSnapshot | null = null;

  const effectiveLabel = () => sanitizeDeviceLabel(readState(deps.storage).deviceLabel) ?? defaultDeviceLabel(userAgent);

  const compute = (): SyncSnapshot => {
    const state = readState(deps.storage);
    let phase: SyncPhase;
    if (!state.enabled) phase = 'off';
    else if (!isConnected(deps)) phase = 'not_connected';
    else if (state.halt === 'no_permission' || !mayHaveSyncScope(deps)) phase = 'no_permission';
    else if (state.halt === 'too_large') phase = 'too_large';
    else if (state.halt === 'error') phase = 'error';
    else if (needsReview(state, deps.now())) phase = 'needs_review';
    else if (running) phase = 'syncing';
    else if (retryPending) phase = 'retry';
    else phase = 'idle';
    return { phase, enabled: state.enabled, lastSyncAt: state.lastSyncAt, customLabel: state.deviceLabel, effectiveLabel: effectiveLabel() };
  };

  const notify = () => {
    const next = compute();
    if (snapshot && JSON.stringify(snapshot) === JSON.stringify(next)) return;
    snapshot = next;
    listeners.forEach((l) => l());
  };

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (retryTimer) clearTimeout(retryTimer);
    debounceTimer = retryTimer = null;
  };

  /** Automatic runs stop while the owner has something to do (halt) or the preconditions are missing. */
  const canRunAutomatically = () => {
    const s = compute();
    return s.enabled && s.phase !== 'not_connected' && s.phase !== 'no_permission' && s.phase !== 'too_large'
      && s.phase !== 'error' && s.phase !== 'needs_review';
  };

  const settle = (outcome: SyncOutcome) => {
    switch (outcome.kind) {
      case 'ok':
        failures = 0;
        retryPending = false;
        break;
      case 'retry':
        failures++;
        retryPending = true;
        scheduleRetry();
        break;
      case 'too_large':
        updateState(deps.storage, { halt: 'too_large' });
        break;
      case 'no_permission':
        updateState(deps.storage, { halt: 'no_permission' });
        break;
      case 'error':
        updateState(deps.storage, { halt: 'error' });
        break;
      case 'not_connected':
      case 'needs_review':
        break; // shown from the stored state
    }
  };

  const scheduleRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (canRunAutomatically()) void run();
    }, delay);
  };

  const run = async (): Promise<void> => {
    if (running) {
      again = true; // one pass at a time; go once more afterwards
      return;
    }
    running = true;
    notify();
    let outcome: SyncOutcome;
    try {
      const guarded: SyncHost = {
        snapshot: () => host.snapshot(),
        applyRemote: (remote) => {
          applying = true; // our own merge is not a user change
          try {
            return host.applyRemote(remote);
          } finally {
            applying = false;
          }
        },
      };
      outcome = await runSync(deps, guarded, effectiveLabel());
    } catch {
      outcome = { kind: 'error', status: null };
    }
    running = false;
    settle(outcome);
    notify();
    if (again) {
      again = false;
      if (outcome.kind === 'ok' && canRunAutomatically()) void run();
    }
  };

  const request = (reason: SyncReason): void => {
    if (reason === 'manual') {
      // The owner asked: clear what stopped automatic sync, then try.
      updateState(deps.storage, { halt: null });
      failures = 0;
      retryPending = false;
      if (retryTimer) clearTimeout(retryTimer);
      notify();
      if (readState(deps.storage).enabled) void run();
      return;
    }
    if (!canRunAutomatically()) return;
    if (reason === 'change') {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (canRunAutomatically()) void run();
      }, DEBOUNCE_MS);
      return;
    }
    if (reason === 'hidden') {
      // Push what is waiting now instead of after the debounce.
      if (!debounceTimer) return;
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void run();
  };

  let stop: (() => void) | null = null;

  /**
   * Connected means sync is on: there is no on/off switch any more. A device that still has "off" stored from the
   * old checkbox is switched on (a stop reason, if any, is kept). Without a sync scope the phase then reads
   * "no permission" and no request is sent (runSync refuses a token known to lack the scope).
   */
  const enableIfConnected = () => {
    if (isConnected(deps) && !readState(deps.storage).enabled) updateState(deps.storage, { enabled: true });
  };

  return {
    getSnapshot: (): SyncSnapshot => (snapshot ??= compute()),
    /** Re-read the stored state (after connect/disconnect or another tab's change). */
    refresh: notify,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    request,
    /** Turns sync on or off for this device. On: start a pass now. */
    setEnabled(on: boolean) {
      updateState(deps.storage, { enabled: on, ...(on ? { halt: null } : {}) });
      if (!on) {
        clearTimers();
        retryPending = false;
        failures = 0;
      }
      notify();
      if (on) request('manual');
    },
    /** null (or text with nothing printable in it) = use the default label. */
    setDeviceLabel(label: string | null) {
      updateState(deps.storage, { deviceLabel: sanitizeDeviceLabel(label) });
      notify();
    },
    /** After a (re)connect: forget a permission stop and sync (connected = on). */
    notifyConnected() {
      enableIfConnected();
      const state = readState(deps.storage);
      if (state.halt === 'no_permission') updateState(deps.storage, { halt: null });
      notify();
      request('start');
    },
    /**
     * Step 1–2 of the stale-device review: read the server document (without raising F) and work out what would be
     * removed and what the rest of the merge looks like. Changes nothing, locally or on the server.
     */
    async prepareReview(): Promise<ReviewPlan> {
      const floorMs = readClockFloor(); // before any request
      const doc = await fetchServerDocument(deps);
      const server = doc?.progress ?? null;
      return { ...planStaleReview(host.snapshot(), server, floorMs), server, floorMs };
    },
    /**
     * Step 3–4, after the owner confirmed: remove those items without tombstones, merge the rest, release the review
     * state and sync once. This is the only way out of "needs review"; cancelling simply never calls it.
     */
    applyReview(plan: ReviewPlan) {
      if (!host.applyStaleReview) throw new Error('host cannot apply a review');
      applying = true; // our own write is not a user change
      try {
        host.applyStaleReview(plan.remove, plan.server, plan.floorMs);
      } finally {
        applying = false;
      }
      updateState(deps.storage, { lastSyncAt: deps.now() });
      request('manual');
    },
    /** Starts the listeners (idempotent). Returns a function that removes them. */
    start(): () => void {
      if (stop) return stop;
      const offLocal = onLocalChange(() => {
        if (!applying) request('change');
      });
      const offState = onExternalChange(STATE_KEY, notify);
      const onVisibility = () => request(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      enableIfConnected();
      notify();
      request('start');
      stop = () => {
        offLocal();
        offState();
        document.removeEventListener('visibilitychange', onVisibility);
        clearTimers();
        stop = null;
      };
      return stop;
    },
  };
}

export type SyncController = ReturnType<typeof createSyncController>;

let instance: SyncController | null = null;
/** The app's controller, wired to the progress store and the browser. */
export const syncController = (): SyncController =>
  (instance ??= createSyncController({
    deps: browserDeps(),
    host: { snapshot: getProgressV2, applyRemote, applyStaleReview },
    onLocalChange: subscribe,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  }));
