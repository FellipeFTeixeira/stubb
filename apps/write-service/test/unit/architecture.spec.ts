import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('fronteira do write-service (CA-4)', () => {
  it('não depende de mongodb nem de mongoose', () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
    expect(names).not.toContain('mongodb');
    expect(names).not.toContain('mongoose');
  });
});
