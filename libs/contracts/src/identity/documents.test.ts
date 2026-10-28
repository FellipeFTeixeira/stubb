import { describe, expect, it } from 'vitest';
import {
  cnpjCheckDigits,
  cpfCheckDigits,
  isValidCnpj,
  isValidCpf,
  maskCpf,
  normalizeCnpj,
  normalizeCpf,
} from '../index.js';

describe('CPF', () => {
  it('normaliza removendo tudo que não é dígito', () => {
    expect(normalizeCpf('123.456.789-09')).toBe('12345678909');
  });

  it('calcula os dígitos verificadores', () => {
    expect(cpfCheckDigits('123456789')).toBe('09');
    expect(cpfCheckDigits('987654321')).toBe('00');
  });

  it.each(['12345678909', '98765432100'])('aceita %s', (v) => {
    expect(isValidCpf(v)).toBe(true);
  });

  it.each(['12345678900', '11111111111', '1234567890', '123456789091', 'abcdefghijk', ''])(
    'rejeita "%s"',
    (v) => {
      expect(isValidCpf(v)).toBe(false);
    },
  );

  it('mascara mantendo as posições 4 a 9', () => {
    expect(maskCpf('12345678909')).toBe('***.456.789-**');
  });
});

describe('CNPJ', () => {
  it('normaliza máscara e caixa', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
  });

  it('calcula os dígitos verificadores, numérico e alfanumérico', () => {
    expect(cnpjCheckDigits('112223330001')).toBe('81');
    expect(cnpjCheckDigits('12ABC34501DE')).toBe('35');
  });

  it.each(['11222333000181', '12ABC34501DE35'])('aceita %s', (v) => {
    expect(isValidCnpj(v)).toBe(true);
  });

  it.each([
    '11222333000180',
    '00000000000000',
    '12abc34501de35',
    '1122233300018',
    '12ABC34501DEAB',
  ])('rejeita %s', (v) => {
    expect(isValidCnpj(v)).toBe(false);
  });

  it('minúsculas validam depois de normalizeCnpj', () => {
    expect(isValidCnpj(normalizeCnpj('12abc34501de35'))).toBe(true);
  });
});
