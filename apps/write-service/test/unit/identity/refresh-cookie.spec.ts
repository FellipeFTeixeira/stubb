import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../../../src/identity/http/refresh-cookie.js';

const requestWith = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;

describe('readRefreshCookie', () => {
  it('lê o valor entre vários cookies', () => {
    expect(readRefreshCookie(requestWith('a=1; stubb_refresh=abc_-123; b=2'))).toBe('abc_-123');
  });

  it('devolve undefined sem header, sem o cookie, vazio ou malformado', () => {
    expect(readRefreshCookie(requestWith())).toBeUndefined();
    expect(readRefreshCookie(requestWith('outro=1'))).toBeUndefined();
    expect(readRefreshCookie(requestWith('stubb_refresh='))).toBeUndefined();
    expect(readRefreshCookie(requestWith('stubb_refresh=%E0%A4%A'))).toBeUndefined();
  });

  it('não confunde com cookie de nome parecido', () => {
    expect(readRefreshCookie(requestWith('x_stubb_refresh=1'))).toBeUndefined();
  });
});

describe('setRefreshCookie e clearRefreshCookie', () => {
  it('grava com as flags do contrato (maxAge em ms)', () => {
    const cookie = vi.fn();
    setRefreshCookie({ cookie } as unknown as Response, 'tok');
    expect(cookie).toHaveBeenCalledWith('stubb_refresh', 'tok', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/identity/session',
      maxAge: 604_800_000,
      secure: true,
    });
  });

  it('limpa com Max-Age 0 no mesmo path', () => {
    const cookie = vi.fn();
    clearRefreshCookie({ cookie } as unknown as Response);
    expect(cookie).toHaveBeenCalledWith(
      'stubb_refresh',
      '',
      expect.objectContaining({ path: '/api/identity/session', maxAge: 0, httpOnly: true }),
    );
  });
});
