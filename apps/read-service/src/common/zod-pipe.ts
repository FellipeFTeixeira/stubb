import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Same 400 shape as the write-service: { statusCode, message, error, issues }.
export class ZodPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodType,
    private readonly field: string,
  ) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      statusCode: 400,
      message: 'Validation failed',
      error: 'Bad Request',
      issues: result.error.issues.map((issue) => ({
        path: [this.field, ...issue.path.map(String)].join('.'),
        message: issue.message,
      })),
    });
  }
}
