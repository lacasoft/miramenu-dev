import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  DEVICE_ID_HEADER,
  deviceIdSchema,
  GENERIC_ERROR_CODES,
} from '@miramenu/contracts';
import type { Request } from 'express';
import { ApiException } from '../../../infrastructure/http/api-exception';

/**
 * The device id a route requires, from its header: the limits count by device, and
 * registering links it to the account. Normalized to lowercase for keys and rows.
 */
export const DeviceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const value = context.switchToHttp().getRequest<Request>().headers[
      DEVICE_ID_HEADER
    ];
    if (typeof value === 'string' && deviceIdSchema.safeParse(value).success)
      return value.toLowerCase();
    throw new ApiException(
      400,
      GENERIC_ERROR_CODES.VALIDATION_FAILED,
      `The ${DEVICE_ID_HEADER} header must be a UUID`,
    );
  },
);
