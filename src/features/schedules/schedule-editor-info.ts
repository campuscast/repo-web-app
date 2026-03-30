type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type ScheduleInfoBlockParams = {
  zoneName: string;
  status: 'draft' | 'locked' | 'published' | '';
  version: number;
  hasReleases: boolean;
  isLocked: boolean;
  lockOwnerDisplay: string;
};

export type ScheduleInfoBlockModel = {
  zone: string;
  statusLabel: string;
  versionLabel: string;
  releaseLabel: string;
  lockOwnerLabel: string;
};

export function buildScheduleInfoBlockModel(params: ScheduleInfoBlockParams, t: TranslateFn): ScheduleInfoBlockModel {
  return {
    zone: params.zoneName,
    statusLabel: t(`schedule.editor.status.${params.status || 'draft'}`),
    versionLabel: String(params.version || 1),
    releaseLabel: params.hasReleases ? t('schedule.editor.released') : t('schedule.editor.notReleased'),
    lockOwnerLabel: params.isLocked ? params.lockOwnerDisplay : t('schedule.editor.unlocked'),
  };
}
