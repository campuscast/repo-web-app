import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScheduleInfoBlockModel } from '../src/features/schedules/schedule-editor-info.ts';

function makeTranslator() {
  return (key) => {
    const dict = {
      'schedule.editor.status.draft': 'Черновик',
      'schedule.editor.status.locked': 'Заблокировано',
      'schedule.editor.status.published': 'Опубликовано',
      'schedule.editor.released': 'Выпущено',
      'schedule.editor.notReleased': 'Не выпускалось',
      'schedule.editor.unlocked': 'Lock отсутствует',
    };
    return dict[key] ?? key;
  };
}

test('info block maps status/version/release and lock owner correctly', () => {
  const t = makeTranslator();
  const lockedModel = buildScheduleInfoBlockModel(
    {
      zoneName: 'Finger',
      status: 'draft',
      version: 3,
      hasReleases: true,
      isLocked: true,
      lockOwnerDisplay: 'Alex Johnson',
    },
    t,
  );

  assert.equal(lockedModel.zone, 'Finger');
  assert.equal(lockedModel.statusLabel, 'Черновик');
  assert.equal(lockedModel.versionLabel, '3');
  assert.equal(lockedModel.releaseLabel, 'Выпущено');
  assert.equal(lockedModel.lockOwnerLabel, 'Alex Johnson');

  const unlockedModel = buildScheduleInfoBlockModel(
    {
      zoneName: 'Finger',
      status: 'published',
      version: 4,
      hasReleases: false,
      isLocked: false,
      lockOwnerDisplay: 'Someone',
    },
    t,
  );
  assert.equal(unlockedModel.statusLabel, 'Опубликовано');
  assert.equal(unlockedModel.releaseLabel, 'Не выпускалось');
  assert.equal(unlockedModel.lockOwnerLabel, 'Lock отсутствует');
});
