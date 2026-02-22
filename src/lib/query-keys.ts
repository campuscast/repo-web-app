export const queryKeys = {
  zones: ['zones'] as const,
  zonePolicy: (zoneId: string) => ['zones', zoneId, 'policy'] as const,
  zoneGroups: (zoneId: string) => ['zones', zoneId, 'groups'] as const,
  devices: (zoneId: string) => ['devices', zoneId] as const,
  content: (zoneId: string) => ['content', zoneId] as const,
  schedules: (zoneId: string) => ['schedules', zoneId] as const,
  me: ['me'] as const
};
