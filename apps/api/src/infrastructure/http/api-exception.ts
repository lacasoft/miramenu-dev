import { HttpException } from '@nestjs/common';

/**
 * An expected failure with its own error code (e.g. SUBDOMAIN_TAKEN) and, optionally,
 * headers such as Retry-After. The filter answers it with the contract's envelope.
 */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message, status);
  }
}
