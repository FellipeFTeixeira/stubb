import {
  CATALOG_TOPIC,
  CatalogDomainEventSchema,
  DIAGNOSTICS_TOPIC,
  DiagnosticsEventSchema,
} from '@stubb/contracts';

// Um parser por tópico: cada tópico valida com o schema do seu contexto.
export const TOPIC_REGISTRY = {
  [DIAGNOSTICS_TOPIC]: (value: unknown) => DiagnosticsEventSchema.parse(value),
  [CATALOG_TOPIC]: (value: unknown) => CatalogDomainEventSchema.parse(value),
};

export type ProjectableEvent = ReturnType<(typeof TOPIC_REGISTRY)[keyof typeof TOPIC_REGISTRY]>;
