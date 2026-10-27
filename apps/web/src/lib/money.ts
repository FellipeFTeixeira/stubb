const DOTTED = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$/;
const PLAIN = /^\d+(,\d{1,2})?$/;

// Conta inteira sobre a string: nada de parseFloat, para não perder centavo.
export function parsePriceToCents(input: string): number | null {
  const text = input.replace(/^\s*R\$/, '').replace(/\s+/g, '');
  if (!DOTTED.test(text) && !PLAIN.test(text)) return null;
  const [whole = '', fraction = ''] = text.split(',');
  const reais = Number(whole.replaceAll('.', ''));
  const cents = Number(fraction.padEnd(2, '0'));
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

export function centsToPriceInput(cents: number): string {
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${reais},${String(cents % 100).padStart(2, '0')}`;
}
