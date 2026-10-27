import {
  CATALOG_LIMITS,
  SECTOR_KINDS,
  ScheduleSessionRequestSchema,
  eventDetailsSchema,
  instantSchema,
  priceCentsSchema,
  requiredText,
  venueDetailsSchema,
  venueSectorInputSchema,
  zonedLocalToInstant,
  type ScheduleSessionRequest,
} from '@stubb/contracts';
import { z } from 'zod';
import { parsePriceToCents } from '@/lib/money';

// Os campos de formulário são sempre texto (o que o usuário digitou). Cada schema converte para
// o corpo do command e termina no schema do contrato, então as regras e mensagens de campo são
// as do servidor. A passagem por `unknown` existe só porque o texto livre ainda não é o enum.
const toContract = (value: unknown): unknown => value;

const wholeNumber = (text: string): number =>
  /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN;

export const venueFormSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    timeZone: z.string(),
  })
  .transform(toContract)
  .pipe(venueDetailsSchema);
export type VenueFormInput = z.input<typeof venueFormSchema>;
export type VenueFormOutput = z.output<typeof venueFormSchema>;

export const sectorFormSchema = z
  .object({
    name: z.string(),
    kind: z.enum(SECTOR_KINDS),
    capacity: z.string(),
    rows: z.array(z.object({ label: z.string(), seats: z.string() })),
  })
  .transform((v): unknown =>
    v.kind === 'seated'
      ? {
          name: v.name,
          kind: v.kind,
          rows: v.rows.map((row) => ({ label: row.label, seats: wholeNumber(row.seats) })),
        }
      : { name: v.name, kind: v.kind, capacity: wholeNumber(v.capacity) },
  )
  .pipe(venueSectorInputSchema);
export type SectorFormInput = z.input<typeof sectorFormSchema>;
export type SectorFormOutput = z.output<typeof sectorFormSchema>;

export const eventFormSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    ageRating: z.string(),
    imageUrl: z.string(),
  })
  .transform((v): unknown => ({ ...v, imageUrl: v.imageUrl.trim() === '' ? null : v.imageUrl }))
  .pipe(eventDetailsSchema);
export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormOutput = z.output<typeof eventFormSchema>;

const scheduleFormFields = z.object({
  venueId: z.string().min(1, 'Escolha um local'),
  startsAt: z.string().min(1, 'Informe a data e a hora'),
  salesStartsAt: z.string().min(1, 'Informe a data e a hora'),
});
export type ScheduleFormInput = z.input<typeof scheduleFormFields>;

// As datas digitadas valem no fuso do local escolhido; o corpo leva esse fuso (RN-22).
export function scheduleFormSchema(timeZoneOf: (venueId: string) => string | undefined) {
  return scheduleFormFields.transform((v, ctx): ScheduleSessionRequest => {
    const timeZone = timeZoneOf(v.venueId);
    if (timeZone === undefined) {
      ctx.issues.push({
        code: 'custom',
        message: 'Local não encontrado.',
        input: v.venueId,
        path: ['venueId'],
      });
      return z.NEVER;
    }
    const instants: Record<'startsAt' | 'salesStartsAt', string> = {
      startsAt: '',
      salesStartsAt: '',
    };
    for (const field of ['startsAt', 'salesStartsAt'] as const) {
      try {
        instants[field] = zonedLocalToInstant(v[field], timeZone);
      } catch {
        ctx.issues.push({
          code: 'custom',
          message: 'Informe uma data e hora válidas',
          input: v[field],
          path: [field],
        });
      }
    }
    if (ctx.issues.length > 0) return z.NEVER;
    const parsed = ScheduleSessionRequestSchema.safeParse({
      venueId: v.venueId,
      ...instants,
      timeZone,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.issues.push({ code: 'custom', message: issue.message, input: v, path: issue.path });
      }
      return z.NEVER;
    }
    return parsed.data;
  });
}
export type ScheduleFormOutput = ScheduleSessionRequest;

export const sessionSectorFormSchema = z.object({
  venueSectorId: z.string().min(1, 'Escolha um setor'),
});
export type SessionSectorFormInput = z.input<typeof sessionSectorFormSchema>;

// `endsAt` é digitado no fuso da sessão (RN-21); o preço é digitado em reais (CA-48).
export function batchFormSchema(timeZone: string) {
  return z.object({
    name: requiredText(CATALOG_LIMITS.batchNameMax),
    price: z
      .string()
      .transform((text, ctx) => {
        const cents = parsePriceToCents(text);
        if (cents === null) {
          ctx.issues.push({
            code: 'custom',
            message: 'Informe um preço como 1.234,56',
            input: text,
          });
          return z.NEVER;
        }
        return cents;
      })
      .pipe(priceCentsSchema),
    quantity: z
      .string()
      .transform((text, ctx) => {
        if (text.trim() === '') return null;
        if (!/^\d+$/.test(text.trim())) {
          ctx.issues.push({ code: 'custom', message: 'Informe um número inteiro', input: text });
          return z.NEVER;
        }
        return Number(text);
      })
      .pipe(z.number().int().min(1, 'Mínimo 1').nullable()),
    endsAt: z
      .string()
      .transform((text, ctx) => {
        if (text.trim() === '') return null;
        try {
          return zonedLocalToInstant(text.trim(), timeZone);
        } catch {
          ctx.issues.push({
            code: 'custom',
            message: 'Informe uma data e hora válidas',
            input: text,
          });
          return z.NEVER;
        }
      })
      .pipe(instantSchema.nullable()),
  });
}
export type BatchFormInput = z.input<ReturnType<typeof batchFormSchema>>;
export type BatchFormOutput = z.output<ReturnType<typeof batchFormSchema>>;
