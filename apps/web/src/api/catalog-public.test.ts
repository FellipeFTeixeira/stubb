import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '@/test/fake-api';
import { getEvent, listEvents } from './catalog-public';
import { ApiError } from './http';

const ID = '0190a0a0-0000-7000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog-public', () => {
  it('listEvents envia q, city, category, page e pageSize', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({
      status: 200,
      body: { items: [], page: 2, pageSize: 12, total: 0, asOf: '2026-10-26T12:00:00.000Z' },
    }));
    api.install();

    const result = await listEvents({ q: 'rock', city: 'Porto Alegre', category: 'show', page: 2 });

    expect(result.page).toBe(2);
    expect(api.calls[0]?.query).toEqual({
      q: 'rock',
      city: 'Porto Alegre',
      category: 'show',
      page: '2',
      pageSize: '12',
    });
  });

  it('listEvents omite filtros ausentes', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events', () => ({
      status: 200,
      body: { items: [], page: 1, pageSize: 24, total: 0, asOf: '2026-10-26T12:00:00.000Z' },
    }));
    api.install();

    await listEvents({ page: 1, pageSize: 24 });

    expect(api.calls[0]?.query).toEqual({ page: '1', pageSize: '24' });
  });

  it('listEvents lança ApiError quando a lista responde 404', async () => {
    const api = createFakeApi();
    api.install();
    await expect(listEvents({ page: 1 })).rejects.toBeInstanceOf(ApiError);
  });

  it('getEvent devolve not-found no 404', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events/:id', () => ({
      status: 404,
      body: { statusCode: 404, message: 'x', minVersionReached: true },
    }));
    api.install();

    expect(await getEvent(ID)).toEqual({ status: 'not-found' });
    expect(api.calls[0]?.path).toBe(`/api/catalog/events/${ID}`);
  });

  it('getEvent valida e achata a resposta', async () => {
    const api = createFakeApi();
    api.on('GET', '/api/catalog/events/:id', () => ({
      status: 200,
      body: {
        event: {
          id: ID,
          version: 3,
          title: 'Show',
          description: 'Descrição',
          category: 'show',
          ageRating: 'L',
          imageUrl: null,
          ended: false,
          asOf: '2026-10-26T12:00:00.000Z',
          sessions: [],
        },
        minVersionReached: true,
      },
    }));
    api.install();

    const result = await getEvent(ID);
    expect(result.status).toBe('found');
    if (result.status === 'found') expect(result.event.title).toBe('Show');
  });
});
