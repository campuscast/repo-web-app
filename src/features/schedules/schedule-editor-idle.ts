export const LOCK_IDLE_WARNING_MS = 5 * 60 * 1000;
export const LOCK_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const LOCK_REFRESH_MIN_INTERVAL_MS = 60 * 1000;

export type LockIdleState = {
  lastActivityAt: number;
  warningVisible: boolean;
};

export function createLockIdleState(now = Date.now()): LockIdleState {
  return {
    lastActivityAt: now,
    warningVisible: false,
  };
}

export function registerLockActivity(state: LockIdleState, now = Date.now()): LockIdleState {
  return {
    ...state,
    lastActivityAt: now,
    warningVisible: false,
  };
}

export function evaluateLockIdle(state: LockIdleState, now = Date.now(), warningAfterMs = LOCK_IDLE_WARNING_MS, timeoutMs = LOCK_IDLE_TIMEOUT_MS) {
  const idleMs = Math.max(0, now - state.lastActivityAt);
  const shouldShowWarning = !state.warningVisible && idleMs >= warningAfterMs && idleMs < timeoutMs;
  const shouldAutoRevert = idleMs >= timeoutMs;
  return {
    idleMs,
    shouldShowWarning,
    shouldAutoRevert,
  };
}

export function resolveLockIdleAction(action: 'continue' | 'save' | 'revert' | 'timeout') {
  if (action === 'continue') {
    return {
      shouldRefreshLock: true,
      shouldPersist: false,
      shouldDiscard: false,
      shouldUnlock: false,
    };
  }

  if (action === 'save') {
    return {
      shouldRefreshLock: false,
      shouldPersist: true,
      shouldDiscard: false,
      shouldUnlock: true,
    };
  }

  return {
    shouldRefreshLock: false,
    shouldPersist: false,
    shouldDiscard: true,
    shouldUnlock: true,
  };
}

export function shouldRefreshLock(now: number, lastRefreshAt: number, minIntervalMs = LOCK_REFRESH_MIN_INTERVAL_MS): boolean {
  return now - lastRefreshAt >= minIntervalMs;
}
