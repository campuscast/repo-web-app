export const queryKeys = {
  zones: ['zones'] as const,
  zonePolicy: (zoneId: string) => ['zones', zoneId, 'policy'] as const,
  zoneGroups: (zoneId: string) => ['zones', zoneId, 'groups'] as const,
  devices: (zoneId: string) => ['devices', zoneId] as const,
  devicePreview: (deviceId: string) => ['devices', deviceId, 'preview'] as const,
  content: (zoneId: string) => ['content', zoneId] as const,
  schedules: (zoneId: string) => ['schedules', zoneId] as const,
  schedule: (scheduleId: string) => ['schedule', scheduleId] as const,
  scheduleCalendar: (scheduleId: string, view: string, date: string) => ['schedule', scheduleId, 'calendar', view, date] as const,
  scheduleDay: (scheduleId: string, date: string) => ['schedule', scheduleId, 'day', date] as const,
  scheduleUsage: (zoneId: string) => ['schedule', zoneId, 'usage'] as const,
  releases: (filtersKey: string) => ['releases', filtersKey] as const,
  release: (releaseId: string) => ['release', releaseId] as const,
  me: ['me'] as const
};
