import { DINERS_ERROR_CODES, GENERIC_ERROR_CODES } from '@miramenu/contracts';
import { ApiException } from '../../../infrastructure/http/api-exception';

export const codeInvalid = () =>
  new ApiException(
    422,
    DINERS_ERROR_CODES.CODE_INVALID,
    'The code is not correct',
  );

export const codeExpired = () =>
  new ApiException(
    422,
    DINERS_ERROR_CODES.CODE_EXPIRED,
    'The code expired or was used up; ask for a new one',
  );

export const phoneNotReachable = () =>
  new ApiException(
    422,
    DINERS_ERROR_CODES.PHONE_NOT_REACHABLE,
    'The code cannot be sent to this number',
  );

export const providerUnavailable = () =>
  new ApiException(
    503,
    DINERS_ERROR_CODES.CODE_PROVIDER_UNAVAILABLE,
    'The code could not be sent; try again later',
  );

export const registrationUnavailable = () =>
  new ApiException(
    503,
    DINERS_ERROR_CODES.REGISTRATION_UNAVAILABLE,
    'Registration is unavailable',
  );

export const privacyNoticeOutdated = () =>
  new ApiException(
    409,
    DINERS_ERROR_CODES.PRIVACY_NOTICE_OUTDATED,
    'The privacy notice changed; show the current one',
  );

export const tooManyRequests = (retryAfterSeconds: number) =>
  new ApiException(
    429,
    GENERIC_ERROR_CODES.TOO_MANY_REQUESTS,
    'Too many codes asked for, retry later',
    { 'Retry-After': String(retryAfterSeconds) },
  );

export const signInRequired = () =>
  new ApiException(
    401,
    GENERIC_ERROR_CODES.UNAUTHENTICATED,
    'Sign in required',
  );
