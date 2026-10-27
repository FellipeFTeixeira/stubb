import { zodResolver } from '@hookform/resolvers/zod';
import {
  AGE_RATINGS,
  EVENT_CATEGORIES,
  type CommandAccepted,
  type CreateEventRequest,
} from '@stubb/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { AGE_RATING_LABELS, CATEGORY_LABELS } from '@/lib/catalog-labels';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import { eventFormSchema, type EventFormInput, type EventFormOutput } from './form-schemas';
import { isConflict } from './is-conflict';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  submitLabel: string;
  defaultValues?: EventFormInput;
  // Quem usa decide qual command é (criar ou editar) e com que versão esperada.
  send: (body: CreateEventRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
  onConflict?: () => void;
};

const EMPTY: EventFormInput = {
  title: '',
  description: '',
  category: '',
  ageRating: '',
  imageUrl: '',
};

const FIELDS = ['title', 'description', 'category', 'ageRating', 'imageUrl'] as const;

export function EventDetailsForm({
  idPrefix,
  submitLabel,
  defaultValues = EMPTY,
  send,
  onAccepted,
  onConflict,
}: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EventFormInput, unknown, EventFormOutput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues,
  });
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit((body) => {
    setFormError(null);
    run(body, {
      onSuccess: onAccepted,
      onError: (error) => {
        if (isConflict(error) && onConflict) return onConflict();
        setFormError(applyCommandError(error, setError, { fields: FIELDS }));
      },
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FieldGroup>
        <FormField id={id('title')} label="Título" error={errors.title?.message}>
          <Input
            {...fieldA11y(id('title'), errors.title?.message)}
            autoComplete="off"
            {...register('title')}
          />
        </FormField>
        <FormField id={id('description')} label="Descrição" error={errors.description?.message}>
          <Textarea
            {...fieldA11y(id('description'), errors.description?.message)}
            rows={5}
            {...register('description')}
          />
        </FormField>
        <FormField id={id('category')} label="Categoria" error={errors.category?.message}>
          <NativeSelect
            {...fieldA11y(id('category'), errors.category?.message)}
            {...register('category')}
          >
            <NativeSelectOption value="">Escolha</NativeSelectOption>
            {EVENT_CATEGORIES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id={id('ageRating')}
          label="Classificação indicativa"
          error={errors.ageRating?.message}
        >
          <NativeSelect
            {...fieldA11y(id('ageRating'), errors.ageRating?.message)}
            {...register('ageRating')}
          >
            <NativeSelectOption value="">Escolha</NativeSelectOption>
            {AGE_RATINGS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {AGE_RATING_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id={id('imageUrl')}
          label="URL da imagem (opcional)"
          error={errors.imageUrl?.message}
        >
          <Input
            {...fieldA11y(id('imageUrl'), errors.imageUrl?.message)}
            type="url"
            autoComplete="off"
            {...register('imageUrl')}
          />
        </FormField>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
