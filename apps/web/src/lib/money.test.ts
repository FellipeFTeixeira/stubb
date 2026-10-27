import { describe, expect, it } from 'vitest';
import { centsToPriceInput, parsePriceToCents } from './money';

describe('parsePriceToCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['0,29', 29],
    ['R$ 80', 8000],
    ['80', 8000],
    ['80,5', 8050],
    [' R$ 1.000 ', 100000],
    ['1234,56', 123456],
  ])('%s -> %i', (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(['abc', '1,234', '', '1.23', '1,2,3', '-5', '12.34.567', 'R$'])('%s -> null', (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });
});

describe('centsToPriceInput', () => {
  it('formata com milhar e duas casas', () => {
    expect(centsToPriceInput(123456)).toBe('1.234,56');
    expect(centsToPriceInput(8000)).toBe('80,00');
    expect(centsToPriceInput(29)).toBe('0,29');
    expect(parsePriceToCents(centsToPriceInput(10000000))).toBe(10000000);
  });
});
