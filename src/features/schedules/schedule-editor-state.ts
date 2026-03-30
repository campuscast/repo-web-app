export type SlotSource = 'publication' | 'asset';

export type EmptyTimelineDraftParams = {
  zoneId: string;
  date: string;
  source: SlotSource;
  publicationId: string;
  assetId: string;
  startTime: string;
  endTime: string;
};

export function buildEmptyTimelineDraft(params: EmptyTimelineDraftParams) {
  return {
    source: params.source,
    publication_id: params.source === 'publication' ? params.publicationId : '',
    asset_id: params.source === 'asset' ? params.assetId : '',
    start_date: params.date,
    start_time: params.startTime,
    end_date: params.date,
    end_time: params.endTime,
    priority: '1',
    group_id: '',
    zone_id: params.zoneId,
  };
}

export function deriveSlotEditorActionState(params: {
  hasEditableLock: boolean;
  hasSelectedSlot: boolean;
  isEditingSlot: boolean;
  labels?: {
    saveSlot: string;
    updateSlot: string;
    resetSlot: string;
    deleteSelectedSlot: string;
  };
}) {
  const labels = params.labels ?? {
    saveSlot: 'Save slot',
    updateSlot: 'Update slot',
    resetSlot: 'Reset slot',
    deleteSelectedSlot: 'Delete selected slot',
  };
  const saveTooltip = params.isEditingSlot ? labels.updateSlot : labels.saveSlot;

  return {
    save: {
      tooltip: saveTooltip,
      ariaLabel: saveTooltip,
      disabled: !params.hasEditableLock,
      variant: params.isEditingSlot ? 'update' : 'create',
    },
    reset: {
      tooltip: labels.resetSlot,
      ariaLabel: labels.resetSlot,
      disabled: false,
    },
    delete: {
      tooltip: labels.deleteSelectedSlot,
      ariaLabel: labels.deleteSelectedSlot,
      disabled: !params.hasSelectedSlot || !params.hasEditableLock,
    },
  };
}
