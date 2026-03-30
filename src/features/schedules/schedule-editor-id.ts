export type UuidFactory = () => string;

export function buildScheduleWorkspaceSessionId(generateUuid: UuidFactory): string {
  return `workspace-${generateUuid()}`;
}

export function buildScheduleOperationId(generateUuid: UuidFactory): string {
  return generateUuid();
}

export function resolveScheduleSlotId(slotId: string | undefined, generateUuid: UuidFactory): string {
  return slotId || generateUuid();
}
