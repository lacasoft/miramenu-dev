import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ErrorResponse, GENERIC_ERROR_CODES } from '@miramenu/contracts';
import type { Request, Response } from 'express';
import { isDatabaseUnavailable } from '../database/database-unavailable';
import { ApiException } from './api-exception';
import { requestIdOf } from './request-id';
import { RequestValidationException } from './request-validation';

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: GENERIC_ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: GENERIC_ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: GENERIC_ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: GENERIC_ERROR_CODES.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: GENERIC_ERROR_CODES.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: GENERIC_ERROR_CODES.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: GENERIC_ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]:
    GENERIC_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: GENERIC_ERROR_CODES.TOO_MANY_REQUESTS,
  [HttpStatus.INTERNAL_SERVER_ERROR]: GENERIC_ERROR_CODES.INTERNAL_ERROR,
  [HttpStatus.SERVICE_UNAVAILABLE]: GENERIC_ERROR_CODES.SERVICE_UNAVAILABLE,
};

const INTERNAL_ERROR_MESSAGE = 'Internal server error';
const UNAVAILABLE_MESSAGE =
  'Service temporarily unavailable; try again shortly';

/**
 * An HttpException keeps its status. Anything else is a 500, unless Postgres could not be
 * reached: then it is a 503, so the client knows a retry may work (design, "Fallas previstas").
 */
export function errorStatusFor(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  return isDatabaseUnavailable(exception)
    ? HttpStatus.SERVICE_UNAVAILABLE
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function errorCodeFor(exception: unknown, status: number): string {
  if (exception instanceof ApiException) return exception.code;
  if (exception instanceof RequestValidationException)
    return GENERIC_ERROR_CODES.VALIDATION_FAILED;
  return CODE_BY_STATUS[status] ?? `HTTP_${status}`;
}

/**
 * Client errors keep their message. Internal errors never do: a 500 may carry SQL,
 * paths or secrets, so the client only gets a generic text and the log gets the rest.
 * The same goes for a driver's error behind a 503, which names hosts and ports.
 */
export function errorMessageFor(exception: unknown, status: number): string {
  if (!(exception instanceof HttpException)) {
    return status === HttpStatus.SERVICE_UNAVAILABLE
      ? UNAVAILABLE_MESSAGE
      : INTERNAL_ERROR_MESSAGE;
  }
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
    return INTERNAL_ERROR_MESSAGE;
  }
  const response = exception.getResponse();
  if (typeof response === 'string' && response.length > 0) return response;
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const { message } = response;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message) && message.length > 0)
      return message.map(String).join('; ');
  }
  return exception.message.length > 0
    ? exception.message
    : INTERNAL_ERROR_MESSAGE;
}

/** Turns every failure into the contract's envelope: { code, message, requestId }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = errorStatusFor(exception);
    const body: ErrorResponse = {
      code: errorCodeFor(exception, status),
      message: errorMessageFor(exception, status),
      requestId: requestIdOf(response),
    };

    if (status >= 500) {
      // The path, never the query string: queries may carry personal data.
      this.logger.error(
        {
          message: 'Request failed',
          requestId: body.requestId,
          method: request.method,
          path: request.path,
          status,
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (exception instanceof ApiException) {
      for (const [name, value] of Object.entries(exception.headers)) {
        response.setHeader(name, value);
      }
    }
    response.status(status).json(body);
  }
}
