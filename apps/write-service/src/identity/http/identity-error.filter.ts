import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { IdentityError, type IdentityErrorStatus } from '../identity.errors.js';

const NAMES: Record<IdentityErrorStatus, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

@Catch(IdentityError)
export class IdentityErrorFilter implements ExceptionFilter {
  catch(error: IdentityError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(error.status).json({
      statusCode: error.status,
      error: NAMES[error.status],
      message: error.message,
      code: error.code,
    });
  }
}
