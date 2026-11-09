import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';

type PipeOptions = NonNullable<
  ConstructorParameters<typeof StandardSchemaValidationPipe>[0]
>;
type Issues = Parameters<NonNullable<PipeOptions['exceptionFactory']>>[0];
type Issue = Issues[number];

/** A request that did not match its schema. It names the fields, never their values. */
export class RequestValidationException extends BadRequestException {
  constructor(readonly fields: readonly string[]) {
    super(
      fields.length > 0
        ? `Invalid request: ${fields.join(', ')}`
        : 'Invalid request',
    );
  }
}

function pathOf(issue: Issue): string {
  return (issue.path ?? [])
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.');
}

export function fieldsOf(issues: Issues): string[] {
  return [...new Set(issues.map(pathOf).filter((path) => path.length > 0))];
}

/** Validates every parameter that declares a Zod schema (ADR-0026). */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new RequestValidationException(fieldsOf(issues)),
  });
}
