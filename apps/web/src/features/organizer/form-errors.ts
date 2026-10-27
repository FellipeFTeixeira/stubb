import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { commandErrorToForm } from '@/api/command-errors';

type Options = {
  // Campos do formulário que podem receber erro (raiz do path: `rows` cobre `rows.0.label`).
  fields: readonly string[];
  // Nome do campo no corpo do command → nome do campo no formulário (ex.: priceCents → price).
  alias?: Record<string, string>;
};

// Aplica o erro de um command no formulário: o que tem campo vai para o campo (com foco no
// primeiro); o que não tem vira a mensagem do alerta do topo, devolvida aqui.
export function applyCommandError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  { fields, alias = {} }: Options,
): string | null {
  const { fieldErrors, formError } = commandErrorToForm(error);
  const leftover: string[] = [];
  let focused = false;
  for (const { path, message } of fieldErrors) {
    const name = alias[path] ?? path;
    const root = name.split('.')[0] ?? name;
    if (fields.includes(root)) {
      setError(name as Path<T>, { type: 'server', message }, { shouldFocus: !focused });
      focused = true;
    } else {
      leftover.push(message);
    }
  }
  if (leftover.length === 0) return formError;
  return [formError, ...leftover].filter(Boolean).join(' ');
}
