import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmptyTimelineDraft, deriveSlotEditorActionState } from '../src/features/schedules/schedule-editor-state.ts';
import { explainScheduleSaveError, isScheduleLockUnavailableError } from '../src/features/schedules/schedule-editor-errors.ts';

test('empty timeline click draft resets to create mode with selected source', () => {
  const publicationDraft = buildEmptyTimelineDraft({
    zoneId: 'zone-1',
    date: '2026-03-25',
    source: 'publication',
    publicationId: 'pub-1',
    assetId: 'asset-1',
    startTime: '09:00',
    endTime: '10:00',
  });

  assert.equal(publicationDraft.source, 'publication');
  assert.equal(publicationDraft.publication_id, 'pub-1');
  assert.equal(publicationDraft.asset_id, '');
  assert.equal(publicationDraft.start_date, '2026-03-25');
  assert.equal(publicationDraft.end_date, '2026-03-25');

  const assetDraft = buildEmptyTimelineDraft({
    zoneId: 'zone-1',
    date: '2026-03-25',
    source: 'asset',
    publicationId: 'pub-1',
    assetId: 'asset-1',
    startTime: '11:00',
    endTime: '12:00',
  });

  assert.equal(assetDraft.source, 'asset');
  assert.equal(assetDraft.asset_id, 'asset-1');
  assert.equal(assetDraft.publication_id, '');
});

test('slot editor icon actions expose expected disabled state and tooltips', () => {
  const noLock = deriveSlotEditorActionState({
    hasEditableLock: false,
    hasSelectedSlot: false,
    isEditingSlot: false,
  });

  assert.equal(noLock.save.disabled, true);
  assert.equal(noLock.save.tooltip, 'Save slot');
  assert.equal(noLock.delete.disabled, true);
  assert.equal(noLock.reset.tooltip, 'Reset slot');

  const editingWithLock = deriveSlotEditorActionState({
    hasEditableLock: true,
    hasSelectedSlot: true,
    isEditingSlot: true,
  });

  assert.equal(editingWithLock.save.disabled, false);
  assert.equal(editingWithLock.save.tooltip, 'Update slot');
  assert.equal(editingWithLock.delete.disabled, false);
  assert.equal(editingWithLock.delete.tooltip, 'Delete selected slot');
});

test('slot editor action labels can be localized via injected labels', () => {
  const localized = deriveSlotEditorActionState({
    hasEditableLock: true,
    hasSelectedSlot: true,
    isEditingSlot: false,
    labels: {
      saveSlot: 'Сохранить слот',
      updateSlot: 'Обновить слот',
      resetSlot: 'Сбросить слот',
      deleteSelectedSlot: 'Удалить выбранный слот',
    },
  });

  assert.equal(localized.save.tooltip, 'Сохранить слот');
  assert.equal(localized.reset.tooltip, 'Сбросить слот');
  assert.equal(localized.delete.tooltip, 'Удалить выбранный слот');
});

test('save error formatter returns readable invariant and lock messages', () => {
  const translator = (key) => {
    const dict = {
      'schedule.editor.toast.lockMissingOrExpired': 'Lock отсутствует или истёк. Получите lock снова и повторите сохранение.',
      'schedule.editor.toast.slotOverlap': 'Слоты пересекаются по времени в одной зоне/группе.',
      'schedule.editor.toast.saveFailed': 'Не удалось сохранить',
    };
    return dict[key] ?? key;
  };

  const invariantError = Object.assign(new Error('Request failed'), {
    payload: {
      code: 'INVARIANT_VIOLATION',
      violations: [{ code: 'SLOT_OVERLAP', message: 'Слоты a и b пересекаются по времени в одной зоне/группе' }],
    },
  });

  assert.equal(
    explainScheduleSaveError(invariantError, translator),
    'Слоты a и b пересекаются по времени в одной зоне/группе',
  );

  assert.equal(
    explainScheduleSaveError(new Error('No active lock'), translator),
    'Lock отсутствует или истёк. Получите lock снова и повторите сохранение.',
  );
});

test('lock expiry detector catches expired or mismatched lock errors only', () => {
  const missingLock = Object.assign(new Error('Request failed'), {
    payload: { message: 'No active lock' },
  });
  const wrongToken = new Error('Lock token mismatch');
  const overlap = Object.assign(new Error('Request failed'), {
    payload: { code: 'INVARIANT_VIOLATION', message: 'Slots overlap' },
  });

  assert.equal(isScheduleLockUnavailableError(missingLock), true);
  assert.equal(isScheduleLockUnavailableError(wrongToken), true);
  assert.equal(isScheduleLockUnavailableError(overlap), false);
});
