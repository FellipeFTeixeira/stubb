/** Chave de comparação/busca: sem espaços nas pontas, minúsculas pt-BR e sem acentos. */
export function normalizeSearchKey(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
}
