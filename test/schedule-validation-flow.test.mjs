import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublishBlockedByValidation } from '../src/features/schedules/validation-flow.ts';
import { validationResultSchema } from '../src/types/api.ts';

test('validation schema accepts backend payload without valid and derives valid=true', () => {
  const parsed = validationResultSchema.parse({
    has_fatal: false,
    issues: [],
  });

  assert.equal(parsed.has_fatal, false);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.issues, []);
});

test('publish is allowed when has_fatal=false and issues are empty', () => {
  const validation = validationResultSchema.parse({
    has_fatal: false,
    issues: [],
  });

  assert.equal(isPublishBlockedByValidation(validation, validation.issues), false);
});

test('publish is blocked when has_fatal=true', () => {
  const validation = validationResultSchema.parse({
    has_fatal: true,
    issues: [{ severity: 'error', code: 'OVERLAP', message: 'Slots overlap' }],
  });

  assert.equal(isPublishBlockedByValidation(validation, validation.issues), true);
});
