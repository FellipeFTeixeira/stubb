import { useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@stubb/contracts';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getSessionUser,
  refreshSession,
  setAccessToken,
  subscribe,
  type SessionUser,
} from '@/api/auth-session';
import { login, logout, type LoginInput } from '@/api/identity';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export type Session = {
  status: SessionStatus;
  user: SessionUser | null;
  hasRole: (role: UserRole) => boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

// O token e o usuário vivem em `api/auth-session` (módulo, fora do React e fora do cache da API);
// aqui só se espelha isso no React. Nenhum dado de servidor é copiado para estado local (ADR 0008).
// `skipInitialRefresh` existe para testes e storybooks que já semeiam o token.
export function SessionProvider({
  children,
  skipInitialRefresh = false,
}: {
  children: ReactNode;
  skipInitialRefresh?: boolean;
}) {
  const queryClient = useQueryClient();
  const user = useSyncExternalStore(subscribe, getSessionUser);
  const [bootstrapped, setBootstrapped] = useState(skipInitialRefresh);

  useEffect(() => {
    if (skipInitialRefresh) return;
    // No StrictMode o efeito roda duas vezes; `refreshSession` compartilha a chamada em voo.
    let active = true;
    void refreshSession().finally(() => {
      if (active) setBootstrapped(true);
    });
    return () => {
      active = false;
    };
  }, [skipInitialRefresh]);

  const status: SessionStatus = !bootstrapped
    ? 'loading'
    : user === null
      ? 'anonymous'
      : 'authenticated';

  const session: Session = {
    status,
    user,
    hasRole: (role) => user?.roles.includes(role) ?? false,
    async signIn(input) {
      const previousId = getSessionUser()?.id ?? null;
      await login(input);
      // Troca de conta: o cache de uma conta nunca pode aparecer para a outra.
      // `resetQueries` e não `clear`: o `login` já trocou o token e o cabeçalho já montou o `GET /me`;
      // `clear` descartaria essa query em voo e o observador ficaria sem dado (achado na stack real).
      if ((getSessionUser()?.id ?? null) !== previousId) void queryClient.resetQueries();
    },
    async signOut() {
      try {
        await logout();
      } finally {
        setAccessToken(null);
        queryClient.clear();
      }
    },
    async refresh() {
      await refreshSession();
    },
  };

  return <SessionContext value={session}>{children}</SessionContext>;
}

// Contexto e hook ficam no mesmo arquivo do provider de propósito (I-4 do Plan).
// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return session;
}
