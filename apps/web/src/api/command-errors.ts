import { ValidationErrorResponseSchema, type CommandErrorCode } from '@stubb/contracts';
import { ApiError } from './http';

const NOT_FOUND = 'Não encontramos este item. Ele pode ter sido removido.';
const FIELDS_ALERT = 'Confira os campos destacados.';
const NETWORK = 'Sem conexão com o servidor. Tente novamente.';

const MESSAGES: Record<CommandErrorCode, string> = {
  VALIDATION_FAILED: FIELDS_ALERT,
  IDEMPOTENCY_KEY_INVALID: 'Não foi possível enviar. Recarregue a página e tente de novo.',
  IDEMPOTENCY_KEY_MISMATCH:
    'Este envio já foi usado para outro pedido. Recarregue a página e tente de novo.',
  CONCURRENCY_CONFLICT:
    'Os dados mudaram desde que você abriu o formulário. Carregamos a versão atual; confira e envie de novo.',
  AGGREGATE_NOT_FOUND: NOT_FOUND,
  ENTITY_NOT_FOUND: NOT_FOUND,
  VENUE_SECTOR_LIMIT_REACHED: 'O local já tem 20 setores, o máximo permitido.',
  VENUE_SECTOR_NAME_TAKEN: 'Já existe um setor com esse nome neste local.',
  EVENT_NOT_DRAFT: 'Só é possível descartar um evento que ainda não tem sessão publicada.',
  VENUE_NOT_FOUND: 'Local não encontrado.',
  VENUE_TIME_ZONE_CHANGED: 'O fuso do local mudou. Confira os horários e envie de novo.',
  VENUE_WITHOUT_SECTORS:
    'Este local ainda não tem setores. Cadastre pelo menos um setor antes de agendar.',
  SESSION_LIMIT_REACHED: 'O evento já tem 50 sessões, o máximo permitido.',
  SESSION_START_NOT_IN_FUTURE: 'O início da sessão precisa ser no futuro.',
  SESSION_DUPLICATED: 'Já existe uma sessão deste evento neste local e horário.',
  SESSION_NOT_DRAFT: 'Esta sessão já foi publicada e não pode mais ser alterada.',
  VENUE_SECTOR_NOT_FOUND: 'Este setor não existe mais na planta do local.',
  SESSION_SECTOR_ALREADY_PRESENT: 'Este setor já está na sessão.',
  SESSION_SECTOR_NAME_TAKEN: 'A sessão já tem um setor com esse nome.',
  BATCH_LIMIT_REACHED: 'Este setor já tem 10 lotes, o máximo permitido.',
  BATCH_NAME_TAKEN: 'Já existe um lote com esse nome neste setor.',
  BATCH_QUANTITY_EXCEEDS_CAPACITY: 'A soma das quantidades dos lotes passa da capacidade do setor.',
  BATCH_END_OUT_OF_RANGE:
    'O fim do lote precisa ser depois do início das vendas e antes do início da sessão.',
  BATCH_END_BEFORE_PREVIOUS: 'O fim do lote precisa ser depois do fim dos lotes anteriores.',
  PREVIOUS_BATCH_UNBOUNDED:
    'O último lote não tem quantidade nem data de fim; um lote novo nunca ficaria vigente.',
  SESSION_WITHOUT_SECTORS: 'A sessão precisa de pelo menos um setor para ser publicada.',
  SECTOR_WITHOUT_BATCH: 'Todo setor da sessão precisa de pelo menos um lote para publicar.',
  BATCH_ENDED: 'Há lote com data de fim no passado. Remova-o e cadastre de novo.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para fazer isso.',
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já está cadastrado.',
  CPF_ALREADY_REGISTERED: 'Este CPF já está cadastrado.',
  VERIFICATION_TOKEN_INVALID: 'O link de verificação é inválido ou expirou. Peça um novo.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
  SESSION_INVALID: 'Sua sessão não é mais válida. Entre novamente.',
  ALREADY_ORGANIZER: 'Esta conta já é de produtor.',
  ORGANIZER_REQUEST_PENDING: 'Você já tem um pedido de produtor aguardando análise.',
  ORGANIZER_REQUEST_NOT_FOUND: 'Pedido de produtor não encontrado.',
  ORGANIZER_REQUEST_NOT_PENDING: 'Este pedido já foi analisado.',
};

// Campo do formulário que cada erro de regra de negócio (422) destaca.
const FIELD_BY_CODE: Partial<Record<CommandErrorCode, string>> = {
  VENUE_SECTOR_NAME_TAKEN: 'name',
  VENUE_NOT_FOUND: 'venueId',
  VENUE_WITHOUT_SECTORS: 'venueId',
  SESSION_START_NOT_IN_FUTURE: 'startsAt',
  SESSION_DUPLICATED: 'startsAt',
  VENUE_SECTOR_NOT_FOUND: 'venueSectorId',
  SESSION_SECTOR_ALREADY_PRESENT: 'venueSectorId',
  SESSION_SECTOR_NAME_TAKEN: 'venueSectorId',
  BATCH_NAME_TAKEN: 'name',
  BATCH_QUANTITY_EXCEEDS_CAPACITY: 'quantity',
  BATCH_END_OUT_OF_RANGE: 'endsAt',
  BATCH_END_BEFORE_PREVIOUS: 'endsAt',
};

function knownMessage(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(MESSAGES, code)
    ? MESSAGES[code as CommandErrorCode]
    : undefined;
}

function unknownMessage(error: unknown): string {
  return error instanceof ApiError
    ? `Não foi possível concluir (HTTP ${error.status}).`
    : 'Não foi possível concluir.';
}

export function describeCommandError(error: unknown): string {
  if (error instanceof TypeError) return NETWORK;
  if (error instanceof ApiError) return knownMessage(error.code) ?? unknownMessage(error);
  return unknownMessage(error);
}

export type CommandFormError = {
  fieldErrors: Array<{ path: string; message: string }>;
  formError: string | null;
};

export function commandErrorToForm(error: unknown): CommandFormError {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      const parsed = ValidationErrorResponseSchema.safeParse(error.body);
      if (parsed.success) return { fieldErrors: parsed.data.issues, formError: FIELDS_ALERT };
    }
    const code = error.code;
    const message = knownMessage(code);
    const field =
      code !== undefined && error.status === 422
        ? FIELD_BY_CODE[code as CommandErrorCode]
        : undefined;
    if (message !== undefined && field !== undefined) {
      return { fieldErrors: [{ path: field, message }], formError: null };
    }
  }
  return { fieldErrors: [], formError: describeCommandError(error) };
}
