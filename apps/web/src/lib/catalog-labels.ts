import type { AGE_RATINGS, EVENT_CATEGORIES, SECTOR_KINDS } from '@stubb/contracts';

type Category = (typeof EVENT_CATEGORIES)[number];
type AgeRating = (typeof AGE_RATINGS)[number];
type SectorKind = (typeof SECTOR_KINDS)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  show: 'Shows',
  theater: 'Teatro e espetáculos',
  stand_up: 'Stand-up',
  sports: 'Esportes',
  festival: 'Festivais',
  kids: 'Infantil',
  other: 'Outros',
};

export const AGE_RATING_LABELS: Record<AgeRating, string> = {
  L: 'Livre',
  '10': '10 anos',
  '12': '12 anos',
  '14': '14 anos',
  '16': '16 anos',
  '18': '18 anos',
};

export const SECTOR_KIND_LABELS: Record<SectorKind, string> = {
  general_admission: 'Pista',
  seated: 'Assento marcado',
};

export const BATCH_BADGE_LABELS = {
  ended: 'Encerrado',
  current: 'Vigente',
  upcoming: 'Em breve',
} as const;

export const SESSION_STATUS_LABELS = { draft: 'Rascunho', published: 'Publicada' } as const;

export const EVENT_STATUS_LABELS = { draft: 'Rascunho', published: 'Publicado' } as const;
