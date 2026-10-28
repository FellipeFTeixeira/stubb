// Gera o par Ed25519 de desenvolvimento e grava JWT_PRIVATE_KEY / JWT_PUBLIC_KEY no .env.
// Uso: pnpm jwt:keys [--force]
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');
const force = process.argv.includes('--force');

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('.env criado a partir de .env.example');
}

let env = readFileSync(envPath, 'utf8');
const eol = env.includes('\r\n') ? '\r\n' : '\n';

const lineRe = (name) => new RegExp(`^${name}=(.*)$`, 'm');
const hasValue = (name) => (lineRe(name).exec(env)?.[1] ?? '').trim() !== '';

if (!force && (hasValue('JWT_PRIVATE_KEY') || hasValue('JWT_PUBLIC_KEY'))) {
  console.log('Chaves JWT já presentes no .env; nada alterado. Use --force para regerar.');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const b64 = (key, type) => Buffer.from(key.export({ type, format: 'pem' })).toString('base64');

const set = (name, value) => {
  const line = `${name}=${value}`;
  env = lineRe(name).test(env)
    ? env.replace(lineRe(name), () => line)
    : env.replace(/\s*$/, eol) + line + eol;
};

set('JWT_PRIVATE_KEY', b64(privateKey, 'pkcs8'));
set('JWT_PUBLIC_KEY', b64(publicKey, 'spki'));
writeFileSync(envPath, env);
console.log('Chaves JWT (Ed25519, PEM em base64) gravadas no .env.');
