import type { ReactNode } from 'react';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';

type Props = {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
};

// Label + controle + mensagem. O controle recebe `id`, `aria-invalid` e `aria-describedby`
// do chamador (veja `fieldA11y`).
export function FormField({ id, label, error, children }: Props) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
