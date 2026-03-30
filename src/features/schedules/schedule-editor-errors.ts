type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const fallbackTranslate: TranslateFn = (key) => key;

export function isScheduleLockUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const messages = new Set<string>();
  if (error.message) {
    messages.add(error.message);
  }

  const payload = (error as Error & { payload?: unknown }).payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const payloadMessage = (payload as { message?: unknown }).message;
    if (typeof payloadMessage === 'string' && payloadMessage) {
      messages.add(payloadMessage);
    }
  }

  return Array.from(messages).some(
    (message) =>
      message === 'No active lock' ||
      message === 'Lock token mismatch' ||
      message === 'Lock is required before saving',
  );
}

export function explainScheduleSaveError(error: unknown, t: TranslateFn = fallbackTranslate): string {
  if (!(error instanceof Error)) return t('schedule.editor.toast.saveFailed');

  const fallback = error.message || t('schedule.editor.toast.saveFailed');
  const payload = (error as Error & { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') {
    if (isScheduleLockUnavailableError(error)) {
      return t('schedule.editor.toast.lockMissingOrExpired');
    }
    return fallback;
  }

  const details = payload as {
    message?: unknown;
    code?: unknown;
    violations?: Array<{ code?: string; message?: string }>;
  };
  const message = typeof details.message === 'string' ? details.message : fallback;
  const code = typeof details.code === 'string' ? details.code : '';
  const violations = Array.isArray(details.violations) ? details.violations : [];

  if (isScheduleLockUnavailableError(error)) {
    return t('schedule.editor.toast.lockMissingOrExpired');
  }
  if (code === 'INVARIANT_VIOLATION') {
    const overlapMessage = violations.find((violation) => violation.code === 'SLOT_OVERLAP')?.message;
    return overlapMessage || t('schedule.editor.toast.slotOverlap');
  }

  return message;
}
