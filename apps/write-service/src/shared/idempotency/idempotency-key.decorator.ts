import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { idempotencyKeySchema } from '@stubb/contracts';
import type { Request } from 'express';

export function extractIdempotencyKey(_data: unknown, context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<Request>();
  const parsed = idempotencyKeySchema.safeParse(request.headers['idempotency-key']);
  if (!parsed.success) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Idempotency-Key header is required and must be a UUID',
      code: 'IDEMPOTENCY_KEY_INVALID',
    });
  }
  return parsed.data;
}

export const IdempotencyKey = createParamDecorator(extractIdempotencyKey);
