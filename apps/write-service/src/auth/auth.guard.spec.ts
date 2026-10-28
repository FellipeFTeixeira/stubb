import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenVerifier } from './access-token.verifier.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser, Public, Roles } from './decorators.js';

@Controller('probe')
class ProbeController {
  @Public()
  @Get('public')
  open(): string {
    return 'open';
  }

  @Get('private')
  closed(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Roles('organizer')
  @Get('organizer')
  organizer(): string {
    return 'organizer';
  }
}

const USER = { id: '0193a4f0-0000-7000-8000-000000000001', roles: ['customer'] as const };
const verifier = {
  verify: (token: string) => {
    if (token === 'customer') return Promise.resolve({ ...USER, roles: ['customer'] });
    if (token === 'organizer')
      return Promise.resolve({ ...USER, roles: ['customer', 'organizer'] });
    return Promise.reject(new Error('invalid'));
  },
};

describe('AuthGuard', () => {
  let app: INestApplication;
  let http: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: AccessTokenVerifier, useValue: verifier },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, authorization?: string) => {
    const req = request(http).get(path);
    return authorization ? req.set('Authorization', authorization) : req;
  };

  it('rota @Public passa sem header e ignora token inválido', async () => {
    expect((await get('/probe/public')).status).toBe(200);
    expect((await get('/probe/public', 'Bearer lixo')).status).toBe(200);
  });

  it('sem header responde 401 UNAUTHENTICATED', async () => {
    const res = await get('/probe/private');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
    });
  });

  it('header malformado ou token inválido responde 401', async () => {
    expect((await get('/probe/private', 'Basic abc')).status).toBe(401);
    expect((await get('/probe/private', 'Bearer')).status).toBe(401);
    expect((await get('/probe/private', 'Bearer lixo')).status).toBe(401);
  });

  it('token válido sem @Roles passa e expõe o usuário', async () => {
    const res = await get('/probe/private', 'Bearer customer');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: USER.id, roles: ['customer'] });
  });

  it('papel ausente responde 403 FORBIDDEN', async () => {
    const res = await get('/probe/organizer', 'Bearer customer');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden', code: 'FORBIDDEN' });
  });

  it('papel presente passa', async () => {
    expect((await get('/probe/organizer', 'Bearer organizer')).status).toBe(200);
  });

  it('@Roles sem token continua 401, não 403', async () => {
    expect((await get('/probe/organizer')).status).toBe(401);
  });
});
