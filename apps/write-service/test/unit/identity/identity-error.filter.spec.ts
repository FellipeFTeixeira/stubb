import type { ArgumentsHost } from '@nestjs/common';
import { DomainErrorResponseSchema } from '@stubb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { IdentityErrorFilter } from '../../../src/identity/http/identity-error.filter.js';
import { IdentityError, type IdentityErrorStatus } from '../../../src/identity/identity.errors.js';

function run(error: IdentityError) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new IdentityErrorFilter().catch(error, host);
  const [responseBody] = json.mock.calls[0] as [unknown];
  return { status, body: DomainErrorResponseSchema.parse(responseBody) };
}

describe('IdentityErrorFilter', () => {
  const cases: Array<[IdentityErrorStatus, string, string]> = [
    [401, 'Unauthorized', 'INVALID_CREDENTIALS'],
    [403, 'Forbidden', 'EMAIL_NOT_VERIFIED'],
    [404, 'Not Found', 'ORGANIZER_REQUEST_NOT_FOUND'],
    [409, 'Conflict', 'EMAIL_ALREADY_REGISTERED'],
    [422, 'Unprocessable Entity', 'VERIFICATION_TOKEN_INVALID'],
  ];

  it.each(cases)(
    'status %i vira o corpo DomainErrorResponse (%s, %s)',
    (statusCode, name, code) => {
      const { status, body } = run(
        new IdentityError(code as 'INVALID_CREDENTIALS', statusCode, 'mensagem'),
      );
      expect(status).toHaveBeenCalledWith(statusCode);
      expect(body).toEqual({ statusCode, error: name, message: 'mensagem', code });
    },
  );
});
