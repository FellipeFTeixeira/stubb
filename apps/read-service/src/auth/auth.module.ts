import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { importSPKI } from 'jose';
import { JWT_ALGORITHM } from '@stubb/contracts';
import { loadConfig } from '../config.js';
import { AccessTokenVerifier, JWT_PUBLIC_KEY } from './access-token.verifier.js';
import { AuthGuard } from './auth.guard.js';

export interface AuthModuleOptions {
  // Decoded PEM (SPKI). Default: JWT_PUBLIC_KEY from the environment, which is base64 of the PEM.
  publicKeyPem?: string;
}

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        {
          provide: JWT_PUBLIC_KEY,
          useFactory: async () => {
            const pem =
              options.publicKeyPem ??
              Buffer.from(loadConfig().jwtPublicKey ?? '', 'base64').toString('utf8');
            if (!pem.trim()) throw new Error('JWT_PUBLIC_KEY ausente');
            return importSPKI(pem, JWT_ALGORITHM);
          },
        },
        AccessTokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AccessTokenVerifier],
    };
  }
}
