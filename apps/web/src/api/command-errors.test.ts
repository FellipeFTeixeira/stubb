import { COMMAND_ERROR_CODES } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { commandErrorToForm, describeCommandError } from './command-errors';
import { ApiError } from './http';

describe('describeCommandError', () => {
  it('tem mensagem para todos os códigos do contrato', () => {
    for (const code of COMMAND_ERROR_CODES) {
      const message = describeCommandError(new ApiError(422, { code }));
      expect(message).not.toMatch(/HTTP/);
    }
  });

  it('rede, código desconhecido e erro sem status', () => {
    expect(describeCommandError(new TypeError('Failed to fetch'))).toBe(
      'Sem conexão com o servidor. Tente novamente.',
    );
    expect(describeCommandError(new ApiError(503, {}))).toBe(
      'Não foi possível concluir (HTTP 503).',
    );
    expect(describeCommandError(new ApiError(500, { code: 'NOPE' }))).toBe(
      'Não foi possível concluir (HTTP 500).',
    );
    expect(describeCommandError(new Error('x'))).toBe('Não foi possível concluir.');
  });
});

describe('commandErrorToForm', () => {
  it('400 de validação leva os issues aos campos e o alerta ao topo', () => {
    const error = new ApiError(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'name', message: 'Campo obrigatório' }],
    });
    expect(commandErrorToForm(error)).toEqual({
      fieldErrors: [{ path: 'name', message: 'Campo obrigatório' }],
      formError: 'Confira os campos destacados.',
    });
  });

  it('422 com campo mapeado vira erro do campo', () => {
    const error = new ApiError(422, { code: 'VENUE_SECTOR_NAME_TAKEN' });
    expect(commandErrorToForm(error)).toEqual({
      fieldErrors: [{ path: 'name', message: 'Já existe um setor com esse nome neste local.' }],
      formError: null,
    });
  });

  it('422 sem campo, 409, rede e desconhecido viram formError', () => {
    expect(commandErrorToForm(new ApiError(422, { code: 'SESSION_NOT_DRAFT' }))).toEqual({
      fieldErrors: [],
      formError: 'Esta sessão já foi publicada e não pode mais ser alterada.',
    });
    expect(
      commandErrorToForm(new ApiError(409, { code: 'CONCURRENCY_CONFLICT' })).formError,
    ).toMatch(/Os dados mudaram/);
    expect(commandErrorToForm(new TypeError('x'))).toEqual({
      fieldErrors: [],
      formError: 'Sem conexão com o servidor. Tente novamente.',
    });
    expect(commandErrorToForm(new ApiError(502, null))).toEqual({
      fieldErrors: [],
      formError: 'Não foi possível concluir (HTTP 502).',
    });
  });
});
