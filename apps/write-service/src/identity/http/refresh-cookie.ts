import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@stubb/contracts';
import type { Request, Response } from 'express';
import { config } from '../../config.js';

// Lê o cookie do header cru: o Express não faz parse de cookies e não vale uma dependência para isso.
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    // No Express o maxAge é em milissegundos.
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    secure: config.COOKIE_SECURE,
  });
}

// `res.clearCookie` do Express 5 emite só `Expires` no passado; o CA-11 pede `Max-Age=0`.
export function clearRefreshCookie(res: Response): void {
  res.cookie(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
    secure: config.COOKIE_SECURE,
  });
}
