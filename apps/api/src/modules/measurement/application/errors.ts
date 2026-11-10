import {
  GENERIC_ERROR_CODES,
  MEASUREMENT_ERROR_CODES,
} from '@miramenu/contracts';
import { ApiException } from '../../../infrastructure/http/api-exception';

export const queueFull = () =>
  new ApiException(
    503,
    MEASUREMENT_ERROR_CODES.MEASUREMENT_QUEUE_FULL,
    'Measurement is behind; keep the batch and retry later',
    { 'Retry-After': '60' },
  );

export const measurementUnavailable = () =>
  new ApiException(
    503,
    MEASUREMENT_ERROR_CODES.MEASUREMENT_UNAVAILABLE,
    'Measurement is unavailable; keep the batch and retry later',
    { 'Retry-After': '10' },
  );

export const notFound = () =>
  new ApiException(404, GENERIC_ERROR_CODES.NOT_FOUND, 'Not found');
