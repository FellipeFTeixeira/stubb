import { z } from 'zod';
import {
  AGE_RATINGS,
  BRAZIL_STATES,
  BRAZIL_TIME_ZONES,
  CATALOG_LIMITS,
  EVENT_CATEGORIES,
} from './constants.js';

export const requiredText = (max: number) =>
  z.string().trim().min(1, 'Campo obrigatório').max(max, `Use no máximo ${max} caracteres`);

export const venueDetailsSchema = z.object({
  name: requiredText(CATALOG_LIMITS.venueNameMax),
  address: requiredText(CATALOG_LIMITS.venueAddressMax),
  city: requiredText(CATALOG_LIMITS.venueCityMax),
  state: z.enum(BRAZIL_STATES, { error: 'Escolha uma UF' }),
  timeZone: z.enum(BRAZIL_TIME_ZONES, { error: 'Escolha um fuso horário' }),
});

export const seatRowSchema = z.object({
  label: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,3}$/, 'Use de 1 a 3 letras sem acento ou números')
    .transform((s) => s.toUpperCase()),
  seats: z
    .number({ error: 'Informe um número' })
    .int()
    .min(1, 'Mínimo 1')
    .max(CATALOG_LIMITS.seatsPerRowMax, 'Máximo 100'),
});

export const venueSectorInputSchema = z.discriminatedUnion('kind', [
  z.object({
    name: requiredText(CATALOG_LIMITS.sectorNameMax),
    kind: z.literal('general_admission'),
    capacity: z
      .number({ error: 'Informe um número' })
      .int()
      .min(1, 'Mínimo 1')
      .max(CATALOG_LIMITS.generalAdmissionCapacityMax, 'Máximo 50.000'),
  }),
  z
    .object({
      name: requiredText(CATALOG_LIMITS.sectorNameMax),
      kind: z.literal('seated'),
      rows: z
        .array(seatRowSchema)
        .min(1, 'Cadastre pelo menos uma fila')
        .max(CATALOG_LIMITS.rowsPerSectorMax, 'Máximo de 50 filas'),
    })
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.rows.forEach((row, i) => {
        if (seen.has(row.label)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', i, 'label'],
            message: 'Rótulo de fila repetido',
          });
        }
        seen.add(row.label);
      });
    }),
]);

export const httpsUrlSchema = z
  .string()
  .trim()
  .max(CATALOG_LIMITS.imageUrlMax, 'Use no máximo 2048 caracteres')
  .pipe(z.url({ protocol: /^https$/, error: 'Use um endereço https://' }));

export const eventDetailsSchema = z.object({
  title: requiredText(CATALOG_LIMITS.eventTitleMax),
  description: requiredText(CATALOG_LIMITS.eventDescriptionMax),
  category: z.enum(EVENT_CATEGORIES, { error: 'Escolha uma categoria' }),
  ageRating: z.enum(AGE_RATINGS, { error: 'Escolha a classificação' }),
  imageUrl: httpsUrlSchema.nullable(),
});

const PRICE_MESSAGE = 'Informe um preço entre R$ 0,01 e R$ 100.000,00';

export const priceCentsSchema = z
  .number({ error: 'Informe um preço' })
  .int()
  .min(CATALOG_LIMITS.priceCentsMin, PRICE_MESSAGE)
  .max(CATALOG_LIMITS.priceCentsMax, PRICE_MESSAGE);
