import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('read-service boundary (CA-4)', () => {
  it('does not depend on the write store', () => {
    const manifest = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    for (const forbidden of ['"pg"', '"typeorm"', '"@nestjs/typeorm"']) {
      expect(manifest).not.toContain(forbidden);
    }
  });
});
