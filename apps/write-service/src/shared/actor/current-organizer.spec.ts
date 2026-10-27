import { describe, expect, it } from 'vitest';
import { CurrentOrganizer } from './current-organizer.js';

describe('CurrentOrganizer', () => {
  it('devolve o produtor semeado por padrão', () => {
    expect(new CurrentOrganizer().id()).toBe('0193a4f0-0000-7000-8000-000000000001');
  });
});
