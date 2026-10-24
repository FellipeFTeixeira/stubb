import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('fronteira do projector (CA-4)', () => {
  it('não depende de pg, typeorm nem @nestjs/typeorm', () => {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    for (const dep of ['pg', 'typeorm', '@nestjs/typeorm']) {
      expect(raw).not.toContain(`"${dep}"`);
    }
  });
});
