import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';
import { jsonResponse, renderWithClient } from '@/test/render';
import { DiagnosticsPage } from './diagnostics-page';

const ID = '0199c1a2-7b3e-7c4d-8a5f-123456789abc';
const NOW = '2026-10-24T00:00:00.000Z';

// Servidor falso: o "read model" começa defasado em relação ao command (projeção atrasada).
function installFakeServer() {
  let writeVersion = 0;
  let count = 0;
  let projectedVersion = 0;
  const gets: string[] = [];
  const project = () => {
    projectedVersion = writeVersion;
  };

  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (input.endsWith('/increment')) {
        count += 1;
        writeVersion += 1;
        setTimeout(project, 300);
        return Promise.resolve(jsonResponse(202, { id: ID, version: writeVersion }));
      }
      writeVersion = 1;
      setTimeout(project, 300);
      return Promise.resolve(jsonResponse(202, { id: ID, version: 1 }));
    }
    gets.push(input);
    const minVersion = Number(new URL(input, 'http://x').searchParams.get('min_version') ?? 0);
    if (projectedVersion === 0) {
      return Promise.resolve(
        jsonResponse(404, { statusCode: 404, message: 'x', minVersionReached: false }),
      );
    }
    const projectedCount = projectedVersion - 1;
    return Promise.resolve(
      jsonResponse(200, {
        ping: {
          id: ID,
          label: 'meu ping',
          count: Math.min(projectedCount, count),
          version: projectedVersion,
          createdAt: NOW,
          updatedAt: NOW,
        },
        minVersionReached: projectedVersion >= minVersion,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { gets };
}

beforeEach(() => useDiagnosticsStore.setState({ selectedPingId: null, latencyHistory: [] }));
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DiagnosticsPage', () => {
  it('cria, incrementa e mostra o histórico de latências', async () => {
    const { gets } = installFakeServer();
    renderWithClient(<DiagnosticsPage />);
    const user = userEvent.setup();

    await user.type(screen.getByTestId('create-ping-label-input'), 'meu ping');
    await user.click(screen.getByTestId('create-ping-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('ping-sync-status')).toHaveTextContent('aguardando projeção'),
    );
    await waitFor(
      () => expect(screen.getByTestId('ping-sync-status')).toHaveTextContent('sincronizado'),
      {
        timeout: 3000,
      },
    );
    expect(screen.getByTestId('ping-label')).toHaveTextContent('meu ping');
    expect(screen.getByTestId('ping-count')).toHaveTextContent('0');
    expect(screen.getByTestId('ping-version')).toHaveTextContent('1');
    expect(screen.getAllByTestId('latency-entry')).toHaveLength(1);

    await user.click(screen.getByTestId('increment-ping'));
    await waitFor(() => expect(screen.getAllByTestId('latency-entry')).toHaveLength(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(screen.getByTestId('ping-version')).toHaveTextContent('2'));
    expect(screen.getByTestId('ping-count')).toHaveTextContent('1');
    expect(screen.getByTestId('ping-sync-status')).toHaveTextContent('sincronizado');

    // Clicar numa entrada mantém o ping selecionado.
    await user.click(screen.getAllByTestId('latency-entry')[1]!);
    expect(screen.getAllByTestId('latency-entry')[1]).toHaveAttribute('data-ping-id', ID);
    expect(useDiagnosticsStore.getState().selectedPingId).toBe(ID);
    expect(screen.getByTestId('ping-version')).toHaveTextContent('2');

    // Os GET com min_version vêm da query; o Zustand não guarda dado do ping.
    expect(gets.some((url) => url.includes('min_version=1'))).toBe(true);
    expect(gets.some((url) => url.includes('min_version=2'))).toBe(true);
    expect(Object.keys(useDiagnosticsStore.getState()).sort()).toEqual([
      'latencyHistory',
      'recordLatency',
      'selectPing',
      'selectedPingId',
    ]);
  });

  it('mostra erro de command em command-error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(409, { statusCode: 409 }))),
    );
    renderWithClient(<DiagnosticsPage />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('create-ping-label-input'), 'x');
    await user.click(screen.getByTestId('create-ping-submit'));
    expect(await screen.findByTestId('command-error')).toBeInTheDocument();
  });
});
