import { BadRequestException } from '@nestjs/common';
import { CreatePingRequestSchema, ValidationErrorResponseSchema } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(CreatePingRequestSchema);

  it('aceita e devolve a saída do Zod (label com trim)', () => {
    expect(pipe.transform({ label: '  abc  ' })).toEqual({ label: 'abc' });
  });

  it('rejeita com 400, code VALIDATION_FAILED e issues', () => {
    try {
      pipe.transform({ label: '   ' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = ValidationErrorResponseSchema.parse(
        (error as BadRequestException).getResponse(),
      );
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues).toEqual([{ path: 'label', message: 'Informe um rótulo' }]);
    }
  });

  it('trata corpo ausente como {}', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
