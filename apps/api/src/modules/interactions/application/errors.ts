import {
  GENERIC_ERROR_CODES,
  INTERACTIONS_ERROR_CODES,
} from '@miramenu/contracts';
import { ApiException } from '../../../infrastructure/http/api-exception';

export const notFound = () =>
  new ApiException(404, GENERIC_ERROR_CODES.NOT_FOUND, 'Not found');

export const dishNotOnMenu = () =>
  new ApiException(
    404,
    INTERACTIONS_ERROR_CODES.DISH_NOT_ON_MENU,
    "The dish is not on this branch's menu",
  );

export const deviceRequired = () =>
  new ApiException(
    400,
    GENERIC_ERROR_CODES.VALIDATION_FAILED,
    'A device id or a diner session is required',
  );

export const commentChanged = () =>
  new ApiException(
    409,
    INTERACTIONS_ERROR_CODES.COMMENT_CHANGED,
    'The comment changed since it was read; read it again',
  );

export const clientIdReused = () =>
  new ApiException(
    409,
    INTERACTIONS_ERROR_CODES.CLIENT_ID_REUSED,
    'This client id was already used for another comment',
  );

export const tooManyComments = (retryAfterSeconds: number) =>
  new ApiException(
    429,
    GENERIC_ERROR_CODES.TOO_MANY_REQUESTS,
    'Too many comments, retry later',
    { 'Retry-After': String(retryAfterSeconds) },
  );
