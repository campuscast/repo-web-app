import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRandomUuid } from '../src/lib/id.ts';
import {
  buildScheduleOperationId,
  buildScheduleWorkspaceSessionId,
  resolveScheduleSlotId,
} from '../src/features/schedules/schedule-editor-id.ts';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('schedule workspace session id builds without randomUUID support', () => {
  const deterministicCrypto = {
    getRandomValues: (target) => {
      target.set(Uint8Array.from({ length: 16 }, (_, index) => 255 - index));
      return target;
    },
  };

  const sessionId = buildScheduleWorkspaceSessionId(() => safeRandomUuid(deterministicCrypto));
  assert.equal(sessionId, 'workspace-fffefdfc-fbfa-49f8-b7f6-f5f4f3f2f1f0');
  assert.match(sessionId.slice('workspace-'.length), UUID_V4_RE);
});

test('schedule operation id delegates to UUID factory', () => {
  const operationId = buildScheduleOperationId(() => 'op-1');
  assert.equal(operationId, 'op-1');
});

test('slot resolver reuses existing ids and creates missing ids', () => {
  assert.equal(resolveScheduleSlotId('slot-existing', () => 'slot-new'), 'slot-existing');
  assert.equal(resolveScheduleSlotId(undefined, () => 'slot-new'), 'slot-new');
});
