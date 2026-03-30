import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCK_IDLE_WARNING_MS,
  LOCK_IDLE_TIMEOUT_MS,
  createLockIdleState,
  evaluateLockIdle,
  registerLockActivity,
  resolveLockIdleAction,
  shouldRefreshLock,
} from '../src/features/schedules/schedule-editor-idle.ts';

test('inactivity timer resets on activity', () => {
  const initial = createLockIdleState(1_000);
  const beforeReset = evaluateLockIdle(initial, 1_000 + LOCK_IDLE_WARNING_MS + 1);
  assert.equal(beforeReset.shouldShowWarning, true);

  const afterActivity = registerLockActivity(initial, 2_000);
  const afterReset = evaluateLockIdle(afterActivity, 2_000 + 1_000);
  assert.equal(afterReset.shouldShowWarning, false);
  assert.equal(afterReset.shouldAutoRevert, false);
});

test('warning and timeout thresholds are evaluated correctly', () => {
  const state = createLockIdleState(10_000);

  const warning = evaluateLockIdle(state, 10_000 + LOCK_IDLE_WARNING_MS + 1);
  assert.equal(warning.shouldShowWarning, true);
  assert.equal(warning.shouldAutoRevert, false);

  const timeout = evaluateLockIdle(state, 10_000 + LOCK_IDLE_TIMEOUT_MS + 1);
  assert.equal(timeout.shouldAutoRevert, true);
});

test('idle action mapping for continue/save/revert/timeout', () => {
  const continueAction = resolveLockIdleAction('continue');
  assert.equal(continueAction.shouldRefreshLock, true);
  assert.equal(continueAction.shouldUnlock, false);

  const saveAction = resolveLockIdleAction('save');
  assert.equal(saveAction.shouldPersist, true);
  assert.equal(saveAction.shouldUnlock, true);

  const revertAction = resolveLockIdleAction('revert');
  const timeoutAction = resolveLockIdleAction('timeout');
  assert.deepEqual(timeoutAction, revertAction);
});

test('continue action should trigger refresh only after min interval', () => {
  assert.equal(shouldRefreshLock(10_000, 5_000, 2_000), true);
  assert.equal(shouldRefreshLock(6_500, 5_000, 2_000), false);
});
