import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { config } from '../config.js';
import { SharedModule } from '../shared/shared.module.js';
import { AccessTokenIssuer } from './access-token.issuer.js';
import { AccessTokenVerifier } from './access-token.verifier.js';
import { AuthGuard } from './auth.guard.js';
import { JWT_KEYS, loadJwtKeys } from './jwt-keys.js';

// Guard global default-deny. Falha no bootstrap se as chaves JWT não estiverem configuradas.
@Global()
@Module({
  imports: [SharedModule],
  providers: [
    { provide: JWT_KEYS, useFactory: () => loadJwtKeys(config) },
    AccessTokenIssuer,
    AccessTokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessTokenIssuer, AccessTokenVerifier],
})
export class AuthModule {}
