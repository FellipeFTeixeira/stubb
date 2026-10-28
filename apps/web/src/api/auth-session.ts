import {
  AccessTokenClaimsSchema,
  SessionResponseSchema,
  identityRoutes,
  type UserRole,
} from '@stubb/contracts';

// O access token vive só nesta variável de módulo: nada vai para localStorage nem sessionStorage
// (o refresh token é um cookie HttpOnly que o JS nunca enxerga). Recarregar a página perde o token
// e o `SessionProvider` o recupera com `refreshSession()`.

export type SessionUser = { id: string; roles: UserRole[] };

let accessToken: string | null = null;
let sessionUser: SessionUser | null = null;
let inFlightRefresh: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function decodeUser(token: string): SessionUser | null {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const claims = AccessTokenClaimsSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    );
    return claims.success ? { id: claims.data.sub, roles: claims.data.roles } : null;
  } catch {
    return null;
  }
}

function sameUser(a: SessionUser | null, b: SessionUser | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id && a.roles.length === b.roles.length && a.roles.every((r, i) => r === b.roles[i])
  );
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Claims lidas do payload, sem verificar a assinatura: serve só para a interface (mostrar/ocultar
// links). Quem decide acesso é o servidor. A referência é estável enquanto id e papéis não mudam.
export function getSessionUser(): SessionUser | null {
  return sessionUser;
}

export function setAccessToken(token: string | null): void {
  const next = token === null ? null : decodeUser(token);
  accessToken = next === null ? null : token;
  if (!sameUser(sessionUser, next)) sessionUser = next;
  for (const listener of [...listeners]) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function doRefresh(): Promise<boolean> {
  try {
    const response = await fetch(identityRoutes.sessionRefresh(), {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (response.status === 401) {
      setAccessToken(null);
      return false;
    }
    if (response.status !== 200) return false;
    const session = SessionResponseSchema.parse(await response.json());
    setAccessToken(session.accessToken);
    return accessToken !== null;
  } catch {
    // Falha de rede ou corpo inesperado: não derruba a sessão local, só informa que não renovou.
    return false;
  }
}

// Chamadas simultâneas (várias requisições com 401, StrictMode) compartilham um único fetch,
// porque o refresh token rotaciona: um segundo uso do mesmo cookie seria lido como reuso.
export function refreshSession(): Promise<boolean> {
  inFlightRefresh ??= doRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}
