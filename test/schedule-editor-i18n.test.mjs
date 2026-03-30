import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('schedule editor uses i18n keys for updated workspace copy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/schedules/schedule-editor.tsx'),
    'utf8',
  );

  assert.equal(source.includes("useLocale()"), true);
  assert.equal(source.includes("t('schedule.editor.info.lockOwner')"), true);
  assert.equal(source.includes("t('schedule.editor.idleModal.title')"), true);
  assert.equal(source.includes("t('schedule.editor.timelineDescription')"), true);

  assert.equal(source.includes('Lock owner:'), false);
  assert.equal(source.includes('TTL:'), false);
  assert.equal(source.includes('Schedule workspace'), false);
});
