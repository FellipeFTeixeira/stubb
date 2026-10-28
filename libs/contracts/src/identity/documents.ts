export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '');
}

function allSame(value: string): boolean {
  return value.split('').every((c) => c === value[0]);
}

function weightedDigit(
  chars: string,
  weights: readonly number[],
  charValue: (c: string) => number,
) {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += charValue(chars[i] as string) * (weights[i] as number);
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const digitValue = (c: string): number => Number(c);

/** Os 2 dígitos verificadores do CPF a partir dos 9 primeiros dígitos. */
export function cpfCheckDigits(base9: string): string {
  const d1 = weightedDigit(base9, [10, 9, 8, 7, 6, 5, 4, 3, 2], digitValue);
  const d2 = weightedDigit(`${base9}${d1}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2], digitValue);
  return `${d1}${d2}`;
}

/** Espera o CPF já normalizado (só dígitos). */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || allSame(digits)) return false;
  return cpfCheckDigits(digits.slice(0, 9)) === digits.slice(9);
}

/** `12345678909` -> `***.456.789-**`: mantém as posições 4 a 9. */
export function maskCpf(digits: string): string {
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function normalizeCnpj(input: string): string {
  return input.replace(/[.\-/\s]/g, '').toUpperCase();
}

// Valor de cada caractere do CNPJ (numérico ou alfanumérico) = código ASCII - 48.
const cnpjCharValue = (c: string): number => c.charCodeAt(0) - 48;
const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Os 2 dígitos verificadores do CNPJ a partir dos 12 primeiros caracteres `[0-9A-Z]`. */
export function cnpjCheckDigits(base12: string): string {
  const d1 = weightedDigit(base12, CNPJ_WEIGHTS_1, cnpjCharValue);
  const d2 = weightedDigit(`${base12}${d1}`, CNPJ_WEIGHTS_2, cnpjCharValue);
  return `${d1}${d2}`;
}

/** Espera o CNPJ já normalizado (maiúsculas, sem máscara). */
export function isValidCnpj(value: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value) || allSame(value)) return false;
  return cnpjCheckDigits(value.slice(0, 12)) === value.slice(12);
}
