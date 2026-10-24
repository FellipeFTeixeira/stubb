import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithClient } from '@/test/render';
import { CreatePingForm } from './create-ping-form';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = '0199c1a2-7b3e-7c4d-8a5f-123456789abc';

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(202, { id: ID, version: 1 })));
  vi.stubGlobal('fetch', fetchMock);
  const onCreated = vi.fn();
  renderWithClient(<CreatePingForm onCreated={onCreated} onError={vi.fn()} />);
  return { fetchMock, onCreated };
}

describe('CreatePingForm', () => {
  it.each([['   '], ['a'.repeat(51)]])('rejeita label %j sem chamar fetch', async (label) => {
    const { fetchMock } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('create-ping-label-input'), label);
    await user.click(screen.getByTestId('create-ping-submit'));
    expect(await screen.findByTestId('create-ping-label-error')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia um label válido uma vez, com Idempotency-Key UUID, e uma nova ação gera nova chave', async () => {
    const { fetchMock, onCreated } = setup();
    const user = userEvent.setup();
    const input = screen.getByTestId('create-ping-label-input');

    await user.type(input, '  meu ping  ');
    await user.click(screen.getByTestId('create-ping-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(input, 'outro');
    await user.click(screen.getByTestId('create-ping-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const keys = calls.map(
      ([, init]) => (init.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toMatch(UUID);
    expect(keys[1]).toMatch(UUID);
    expect(keys[0]).not.toBe(keys[1]);
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ label: 'meu ping' });
  });
});
