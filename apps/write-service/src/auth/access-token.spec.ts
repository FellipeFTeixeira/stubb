import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { Clock } from '../shared/clock/clock.js';
import { AccessTokenIssuer } from './access-token.issuer.js';
import { AccessTokenVerifier } from './access-token.verifier.js';
import { loadJwtKeys, type JwtKeys } from './jwt-keys.js';

const USER_ID = '0193a4f0-0000-7000-8000-000000000001';
const b64 = (key: KeyObject, type: 'pkcs8' | 'spki') =>
  Buffer.from(key.export({ type, format: 'pem' }) as string).toString('base64');

async function keysFrom(pair: { privateKey: KeyObject; publicKey: KeyObject }): Promise<JwtKeys> {
  return loadJwtKeys({
    JWT_PRIVATE_KEY: b64(pair.privateKey, 'pkcs8'),
    JWT_PUBLIC_KEY: b64(pair.publicKey, 'spki'),
  });
}

const clockAt = (date: Date): Clock => ({ now: () => date });

describe('access token (EdDSA)', () => {
  let pair: { privateKey: KeyObject; publicKey: KeyObject };
  let keys: JwtKeys;
  let verifier: AccessTokenVerifier;

  beforeAll(async () => {
    pair = generateKeyPairSync('ed25519');
    keys = await keysFrom(pair);
    verifier = new AccessTokenVerifier(keys);
  });

  it('ida e volta: emite e verifica sub e roles', async () => {
    const issuer = new AccessTokenIssuer(keys, new Clock());
    const { accessToken, expiresIn } = await issuer.issue({ id: USER_ID, roles: ['customer'] });
    expect(expiresIn).toBe(900);
    await expect(verifier.verify(accessToken)).resolves.toEqual({
      id: USER_ID,
      roles: ['customer'],
    });
  });

  it('usa o Clock no iat e exp = iat + 900', async () => {
    const at = new Date(Date.now() - 60_000);
    const issuer = new AccessTokenIssuer(keys, clockAt(at));
    const { accessToken } = await issuer.issue({ id: USER_ID, roles: ['customer'] });
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { iat: number; exp: number; iss: string; aud: string };
    expect(payload.iat).toBe(Math.floor(at.getTime() / 1000));
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload).toMatchObject({ iss: 'stubb-identity', aud: 'stubb-api' });
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'roles', 'sub']);
  });

  it('recusa token vencido', async () => {
    const issuer = new AccessTokenIssuer(keys, clockAt(new Date(Date.now() - 3_600_000)));
    const { accessToken } = await issuer.issue({ id: USER_ID, roles: ['customer'] });
    await expect(verifier.verify(accessToken)).rejects.toThrow();
  });

  it('recusa token assinado com outra chave', async () => {
    const other = await keysFrom(generateKeyPairSync('ed25519'));
    const { accessToken } = await new AccessTokenIssuer(other, new Clock()).issue({
      id: USER_ID,
      roles: ['customer'],
    });
    await expect(verifier.verify(accessToken)).rejects.toThrow();
  });

  async function signWith(
    claims: { aud: string; iss: string },
    alg: 'EdDSA' | 'HS256' = 'EdDSA',
  ): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({ roles: ['customer'] })
      .setProtectedHeader({ alg })
      .setSubject(USER_ID)
      .setIssuer(claims.iss)
      .setAudience(claims.aud)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900);
    return alg === 'EdDSA'
      ? jwt.sign(keys.privateKey)
      : jwt.sign(new TextEncoder().encode('segredo-de-teste-com-32-bytes-ok!!'));
  }

  it('recusa aud errado', async () => {
    await expect(
      verifier.verify(await signWith({ aud: 'outra-api', iss: 'stubb-identity' })),
    ).rejects.toThrow();
  });

  it('recusa iss errado', async () => {
    await expect(
      verifier.verify(await signWith({ aud: 'stubb-api', iss: 'outro-emissor' })),
    ).rejects.toThrow();
  });

  it('recusa alg diferente de EdDSA', async () => {
    await expect(
      verifier.verify(await signWith({ aud: 'stubb-api', iss: 'stubb-identity' }, 'HS256')),
    ).rejects.toThrow();
  });

  it('recusa lixo', async () => {
    await expect(verifier.verify('nao-e-um-jwt')).rejects.toThrow();
  });

  it('loadJwtKeys falha sem as variáveis', async () => {
    await expect(loadJwtKeys({})).rejects.toThrow('JWT_PRIVATE_KEY/JWT_PUBLIC_KEY ausente');
  });
});
