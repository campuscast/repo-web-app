import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('calendar empty cell click clears slot selection before opening timeline', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/schedules/schedule-editor.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /recordUserActivity\('calendar-select-day'\);\s*setSelectedSlotId\(''\);\s*setWorkspaceState\('timeline', cell\.date\);/,
  );
});

test('lock owner fallback no longer exposes a raw lock owner id', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/schedules/schedule-editor.tsx'),
    'utf8',
  );

  assert.equal(source.includes('lockOwnerId.slice(0, 8)'), false);
  assert.equal(source.includes("t('schedule.editor.unknownUser')"), true);
});
