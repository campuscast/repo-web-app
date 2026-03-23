export type ValidationIssueLike = {
  severity: string;
  code: string;
  message: string;
};

export type ValidationResultLike = {
  valid: boolean;
  has_fatal: boolean;
};

type PublishValidationOptions = {
  checkSignature?: boolean;
};

export function inferSignatureFailure(issues: ValidationIssueLike[] = []) {
  return issues.some(
    (issue) => issue.code.toLowerCase().includes('sign') || issue.message.toLowerCase().includes('signature'),
  );
}

export function isPublishBlockedByValidation(
  validation: ValidationResultLike,
  issues: ValidationIssueLike[] = [],
  options: PublishValidationOptions = {},
) {
  if (!validation.valid || validation.has_fatal) {
    return true;
  }

  if (options.checkSignature && inferSignatureFailure(issues)) {
    return true;
  }

  return false;
}
