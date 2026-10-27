import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, rows, truncateAll, type TestApp } from '../setup.js';

interface Fk {
  table_name: string;
  column_name: string;
  foreign_table: string;
  delete_rule: string;
}

describe('Esquema do Catalog no PostgreSQL', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.dataSource);
  });

  it('as chaves estrangeiras existem com a regra de exclusão do Plan', async () => {
    const fks = await rows<Fk>(
      ctx.dataSource,
      `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name LIKE 'catalog_%'
        ORDER BY tc.table_name, kcu.column_name`,
    );
    expect(fks).toEqual([
      {
        table_name: 'catalog_batches',
        column_name: 'session_sector_id',
        foreign_table: 'catalog_session_sectors',
        delete_rule: 'CASCADE',
      },
      {
        table_name: 'catalog_session_sectors',
        column_name: 'session_id',
        foreign_table: 'catalog_sessions',
        delete_rule: 'CASCADE',
      },
      {
        table_name: 'catalog_sessions',
        column_name: 'event_id',
        foreign_table: 'catalog_events',
        delete_rule: 'CASCADE',
      },
      {
        table_name: 'catalog_sessions',
        column_name: 'venue_id',
        foreign_table: 'catalog_venues',
        delete_rule: 'RESTRICT',
      },
      {
        table_name: 'catalog_venue_sectors',
        column_name: 'venue_id',
        foreign_table: 'catalog_venues',
        delete_rule: 'CASCADE',
      },
    ]);
  });

  it('catalog_session_sectors.venue_sector_id não tem FK (a cópia sobrevive à planta)', async () => {
    const fks = await rows<Fk>(
      ctx.dataSource,
      `SELECT tc.table_name, kcu.column_name, '' AS foreign_table, '' AS delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'venue_sector_id'`,
    );
    expect(fks).toEqual([]);
  });

  const ID = (n: number) => `0190a0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
  const NOW = '2026-11-01T12:00:00Z';

  async function seedTree() {
    const q = (sql: string, params: unknown[] = []) => ctx.dataSource.query(sql, params);
    await q(
      `INSERT INTO catalog_venues VALUES ($1, $2, 'V', 'a', 'c', 'SP', 'America/Sao_Paulo', 1, $3, $3)`,
      [ID(1), ID(9), NOW],
    );
    await q(
      `INSERT INTO catalog_events VALUES ($1, $2, 't', 'd', 'show', 'L', NULL, 'draft', 1, $3, $3)`,
      [ID(2), ID(9), NOW],
    );
    await q(
      `INSERT INTO catalog_sessions VALUES ($1, $2, $3, 'draft', '2026-12-10T20:00Z', $4, 'America/Sao_Paulo', $4)`,
      [ID(3), ID(2), ID(1), NOW],
    );
    await q(
      `INSERT INTO catalog_session_sectors VALUES ($1, $2, $3, 'Pista', 'pista', 'general_admission', 10, NULL, 1)`,
      [ID(4), ID(3), ID(5)],
    );
    await q(`INSERT INTO catalog_batches VALUES ($1, $2, 'L1', 'l1', 100, NULL, NULL, 1)`, [
      ID(6),
      ID(4),
    ]);
  }

  it('as uniques rejeitam duplicata (sessão, setor da sessão, lote, setor do local)', async () => {
    await seedTree();
    const q = (sql: string, params: unknown[]) => ctx.dataSource.query(sql, params);
    await expect(
      q(
        `INSERT INTO catalog_sessions VALUES ($1, $2, $3, 'draft', '2026-12-10T20:00Z', $4, 'America/Sao_Paulo', $4)`,
        [ID(13), ID(2), ID(1), NOW],
      ),
    ).rejects.toThrow(/uq_catalog_sessions_event_venue_starts_at/);
    await expect(
      q(
        `INSERT INTO catalog_session_sectors VALUES ($1, $2, $3, 'Outro', 'outro', 'general_admission', 10, NULL, 2)`,
        [ID(14), ID(3), ID(5)],
      ),
    ).rejects.toThrow(/uq_catalog_session_sectors_venue_sector/);
    await expect(
      q(
        `INSERT INTO catalog_session_sectors VALUES ($1, $2, $3, 'PISTA', 'pista', 'general_admission', 10, NULL, 2)`,
        [ID(15), ID(3), ID(16)],
      ),
    ).rejects.toThrow(/uq_catalog_session_sectors_name_key/);
    await expect(
      q(`INSERT INTO catalog_batches VALUES ($1, $2, 'L1', 'l1', 100, NULL, NULL, 2)`, [
        ID(17),
        ID(4),
      ]),
    ).rejects.toThrow(/uq_catalog_batches_name_key/);
    await expect(
      q(`INSERT INTO catalog_batches VALUES ($1, $2, 'L2', 'l2', 100, NULL, NULL, 1)`, [
        ID(18),
        ID(4),
      ]),
    ).rejects.toThrow(/uq_catalog_batches_position/);
    await q(
      `INSERT INTO catalog_venue_sectors VALUES ($1, $2, 'S', 's', 'general_admission', 10, NULL, 1)`,
      [ID(19), ID(1)],
    );
    await expect(
      q(
        `INSERT INTO catalog_venue_sectors VALUES ($1, $2, 'S2', 's', 'general_admission', 10, NULL, 2)`,
        [ID(20), ID(1)],
      ),
    ).rejects.toThrow(/uq_catalog_venue_sectors_name_key/);
  });

  it('o local com sessão não pode ser removido (RESTRICT); o evento leva os filhos (CASCADE)', async () => {
    await seedTree();
    await expect(
      ctx.dataSource.query('DELETE FROM catalog_venues WHERE id = $1', [ID(1)]),
    ).rejects.toThrow(/foreign key/);
    await ctx.dataSource.query('DELETE FROM catalog_events WHERE id = $1', [ID(2)]);
    const left = await rows<{ n: number }>(
      ctx.dataSource,
      'SELECT (SELECT count(*) FROM catalog_sessions)::int + (SELECT count(*) FROM catalog_session_sectors)::int + (SELECT count(*) FROM catalog_batches)::int AS n',
    );
    expect(left).toEqual([{ n: 0 }]);
  });
});
