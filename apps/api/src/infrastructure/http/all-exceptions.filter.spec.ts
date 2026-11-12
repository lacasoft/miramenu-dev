import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  errorCodeFor,
  errorMessageFor,
  errorStatusFor,
} from './all-exceptions.filter';
import { ApiException } from './api-exception';
import { RequestValidationException } from './request-validation';

describe('errorCodeFor with context codes', () => {
  it('uses the code an ApiException carries', () => {
    expect(
      errorCodeFor(
        new ApiException(409, 'SUBDOMAIN_TAKEN', 'Subdomain taken'),
        409,
      ),
    ).toBe('SUBDOMAIN_TAKEN');
    expect(
      errorMessageFor(
        new ApiException(409, 'SUBDOMAIN_TAKEN', 'Subdomain taken'),
        409,
      ),
    ).toBe('Subdomain taken');
  });
});

describe('errorCodeFor', () => {
  it('marks schema failures as VALIDATION_FAILED, not as a plain bad request', () => {
    expect(errorCodeFor(new RequestValidationException(['limit']), 400)).toBe(
      'VALIDATION_FAILED',
    );
    expect(errorCodeFor(new BadRequestException('malformed JSON'), 400)).toBe(
      'BAD_REQUEST',
    );
  });

  it('maps the common statuses to generic codes', () => {
    expect(errorCodeFor(new NotFoundException(), 404)).toBe('NOT_FOUND');
    expect(errorCodeFor(new HttpException('', 401), 401)).toBe(
      'UNAUTHENTICATED',
    );
    expect(errorCodeFor(new Error('boom'), 500)).toBe('INTERNAL_ERROR');
    expect(errorCodeFor(new ServiceUnavailableException(), 503)).toBe(
      'SERVICE_UNAVAILABLE',
    );
  });

  it('falls back to an HTTP_<status> code that still fits the contract', () => {
    expect(errorCodeFor(new HttpException("I'm a teapot", 418), 418)).toBe(
      'HTTP_418',
    );
  });
});

describe('errorStatusFor', () => {
  it('keeps the status of an HttpException', () => {
    expect(errorStatusFor(new NotFoundException())).toBe(404);
    expect(errorStatusFor(new ServiceUnavailableException())).toBe(503);
  });

  it('answers 503 when Postgres cannot be reached, so the client may retry', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const lost = new QueryFailedError(
      'SELECT 1',
      [],
      new Error('Connection terminated unexpectedly'),
    );
    expect(errorStatusFor(refused)).toBe(503);
    expect(errorStatusFor(lost)).toBe(503);
    expect(errorCodeFor(refused, 503)).toBe('SERVICE_UNAVAILABLE');
  });

  it('leaves any other unexpected error as a 500', () => {
    expect(errorStatusFor(new Error('boom'))).toBe(500);
    expect(
      errorStatusFor(
        new QueryFailedError('SELECT', [], new Error('syntax error')),
      ),
    ).toBe(500);
  });
});

describe('errorMessageFor', () => {
  it('keeps the message of a client error', () => {
    expect(
      errorMessageFor(new NotFoundException('Cannot GET /nowhere'), 404),
    ).toBe('Cannot GET /nowhere');
    expect(
      errorMessageFor(new RequestValidationException(['limit', 'cursor']), 400),
    ).toBe('Invalid request: limit, cursor');
  });

  it('never exposes the message of an unexpected error', () => {
    const leaky = new Error('connect ECONNREFUSED example_db_password=hunter2');
    expect(errorMessageFor(leaky, 500)).toBe('Internal server error');
  });

  it('hides the message even of a deliberate 500', () => {
    expect(
      errorMessageFor(
        new InternalServerErrorException('SELECT * FROM secrets'),
        500,
      ),
    ).toBe('Internal server error');
  });

  it('never exposes the driver error behind a 503 either', () => {
    const refused = Object.assign(
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      { code: 'ECONNREFUSED' },
    );
    expect(errorMessageFor(refused, 503)).toBe(
      'Service temporarily unavailable; try again shortly',
    );
  });

  it('keeps a 503 message, which names the unavailable dependencies', () => {
    expect(
      errorMessageFor(
        new ServiceUnavailableException('Unavailable: redis_cache'),
        503,
      ),
    ).toBe('Unavailable: redis_cache');
  });
});
