import { EVENT_CATEGORIES } from '@stubb/contracts';
import { useState, type SyntheticEvent } from 'react';
import type { ShowcaseFilters } from '@/api/catalog-public';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CATEGORY_LABELS } from '@/lib/catalog-labels';

export function ShowcaseFiltersForm({
  filters,
  onApply,
}: {
  filters: ShowcaseFilters;
  onApply: (filters: ShowcaseFilters) => void;
}) {
  const [q, setQ] = useState(filters.q ?? '');
  const [city, setCity] = useState(filters.city ?? '');
  const [category, setCategory] = useState(filters.category ?? '');

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({
      ...(q.trim() !== '' ? { q: q.trim() } : {}),
      ...(city.trim() !== '' ? { city: city.trim() } : {}),
      ...(category !== '' ? { category } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-4" role="search">
      <Field className="w-56">
        <FieldLabel htmlFor="showcase-q">Buscar por título</FieldLabel>
        <Input id="showcase-q" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <Field className="w-48">
        <FieldLabel htmlFor="showcase-city">Cidade</FieldLabel>
        <Input id="showcase-city" value={city} onChange={(e) => setCity(e.target.value)} />
      </Field>
      <Field className="w-48">
        <FieldLabel htmlFor="showcase-category">Categoria</FieldLabel>
        <NativeSelect
          id="showcase-category"
          className="w-full"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <NativeSelectOption value="">Todas</NativeSelectOption>
          {EVENT_CATEGORIES.map((code) => (
            <NativeSelectOption key={code} value={code}>
              {CATEGORY_LABELS[code]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit">Buscar</Button>
    </form>
  );
}
