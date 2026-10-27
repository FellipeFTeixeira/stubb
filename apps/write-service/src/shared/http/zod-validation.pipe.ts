import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    // Corpo ausente é tratado como `{}`.
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
