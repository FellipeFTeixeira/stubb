import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common';
import {
  ConfirmEmailRequestSchema,
  ResendVerificationRequestSchema,
  type ConfirmEmailRequest,
  type IdentityCommandAccepted,
  type ResendVerificationRequest,
} from '@stubb/contracts';
import { Public } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { RegistrationService } from '../application/registration.service.js';
import { IdentityErrorFilter } from './identity-error.filter.js';

@Public()
@Controller('identity/email-verifications')
@UseFilters(IdentityErrorFilter)
export class EmailVerificationsController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('confirm')
  @HttpCode(202)
  confirm(
    @Body(new ZodValidationPipe(ConfirmEmailRequestSchema)) body: ConfirmEmailRequest,
  ): Promise<IdentityCommandAccepted> {
    return this.registration.confirmEmail(body.token);
  }

  @Post()
  @HttpCode(202)
  async resend(
    @Body(new ZodValidationPipe(ResendVerificationRequestSchema)) body: ResendVerificationRequest,
  ): Promise<Record<string, never>> {
    await this.registration.resendVerification(body.email);
    return {};
  }
}
