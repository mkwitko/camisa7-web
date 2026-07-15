# AUTH.md — Autenticação (AWS Amplify v6 + Cognito)

> Padrão da empresa: **AWS Amplify v6**. Não fazemos OAuth manual (sem PKCE em código próprio, sem token endpoint manual). **Modelo híbrido:** em **staging/produção** o login acontece em produto externo (Hub corporativo) e o app só consome a sessão; em **dev/local** o app mostra um Authenticator interno (`@aws-amplify/ui-react`) pra não depender do Hub.

**Sem auto-cadastro / self-service.** Não há `signUp`, `confirmSignUp`, `forgotPassword` nem `reAuthenticate` no app — provisionamento de usuários é externo (Hub/admin). Login e logout só.

**Single pool por ambiente.** Um único conjunto `VITE_COGNITO_*`; o valor muda por deploy (`.env`). Sem branching homolog/prod dentro do código.

---

## 1. Modelo

### Staging / produção (HUB externo)

```
[Usuário não autenticado abre a app]
        ↓
[requireAuth guard detecta ausência de sessão]
        ↓
[redirect({ href: HUB_URL })]                     ← login acontece lá
        ↓
[Hub autentica e devolve usuário ao app]
        ↓
[Amplify lê cookies do Cognito User Pool]
        ↓
[fetchAuthSession() → idToken] → [payload.sub/email/name → User; authorities → permissions]
        ↓
[App funcional]
```

### Dev / local (Authenticator interno)

```
[Usuário abre a app em localhost / VITE_ENV=development]
        ↓
[AuthGate → LocalAuthenticator (@aws-amplify/ui-react)]   ← form de login no próprio app
        ↓
[handleSignIn: signIn(CUSTOM_WITH_SRP)]
        ↓
[se CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE → prompt OTP → confirmSignIn]
        ↓
[sessão criada → RouterProvider monta → app funcional]
```

**Pontos importantes:**
- **Sem rota `/login` interna em prod.** Em staging/prod quem precisa logar é redirecionado pro `HUB_URL`. O Authenticator interno existe **só em dev/local**.
- **`isLocalAuth`** (`src/lib/auth/local-auth.ts`) decide a estratégia: `VITE_ENV === "development"` **ou** `hostname === "localhost"`, exceto `test`.
- **`AuthGate`** carrega o Authenticator via `lazy()` → o bundle do `@aws-amplify/ui-react` **não entra no chunk principal de prod**.
- **Sem callback OAuth próprio.** Hosted UI/Hub cuida; cookies já estão setados quando voltamos.
- **Sem PKCE manual.** Amplify gerencia tokens.
- **Cookies em vez de localStorage.** Por padrão da empresa (compartilhamento entre apps do mesmo domínio).

---

## 1.1 Authenticator interno (dev/local)

`isLocalAuth`, `local-authenticator.tsx` em `src/lib/auth/`; o `AuthGate` fica em `src/components/shared/auth-gate.tsx`:

```ts
// src/lib/auth/local-auth.ts — flag de estratégia
export const isLocalAuth =
  env.VITE_ENV !== "test" &&
  (env.VITE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"));
```

```tsx
// src/components/shared/auth-gate.tsx — deve envolver o RouterProvider
const LocalAuthenticator = lazy(() => import("../../lib/auth/local-authenticator"));

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isLocalAuth) return <>{children}</>;          // prod/test: passthrough
  return (
    <Suspense fallback={null}>
      <LocalAuthenticator>{children}</LocalAuthenticator>
    </Suspense>
  );
}
```

> ⚠️ **Estado atual do repo:** o `AuthGate` existe mas **ainda não está montado** no `main.tsx` (ver §7). Para habilitar o login interno em dev, envolva o `RouterProvider` com `<AuthGate>`. Sem isso, em dev sem sessão o `AuthProvider` cai no `forceLogout()` → HUB.

```tsx
// local-authenticator.tsx — UI de login (lazy, só carrega em dev)
import "@aws-amplify/ui-react/styles.css";
import { Authenticator } from "@aws-amplify/ui-react";
import { confirmSignIn, signIn } from "aws-amplify/auth";

export default function LocalAuthenticator({ children }) {
  return (
    <Authenticator
      hideSignUp                                       // sem self-service
      services={{
        handleSignIn: async (input) => {
          const output = await signIn({
            username: input.username,
            password: input.password,
            options: { authFlowType: "CUSTOM_WITH_SRP" },
          });
          if (output.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE") {
            const code = window.prompt(i18n.t("common:auth.challengeCodePrompt"));
            if (code) await confirmSignIn({ challengeResponse: code });
          }
          return output;
        },
      }}
    >
      {() => <>{children}</>}
    </Authenticator>
  );
}
```

`hideSignUp` reflete a decisão **sem self-service**. O `prompt()` é dev-only mas a string passa por i18n (`common:auth.challengeCodePrompt`) — regra de zero strings hardcoded vale sempre.

---

## 2. Setup

```bash
pnpm add aws-amplify
```

### 2.1 Configuração — uma vez, no bootstrap

```ts
// src/lib/auth/amplify.ts
import { Amplify } from "aws-amplify";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { CookieStorage } from "aws-amplify/utils";
import { env } from "@/env";

/** Chame uma vez no boot (main.tsx), antes de qualquer código que use auth. */
export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId:       env.VITE_COGNITO_USER_POOL_ID,
        userPoolClientId: env.VITE_COGNITO_CLIENT_ID,
      },
    },
  });

  // Tokens vivem em cookies (não localStorage) — compartilháveis entre apps do mesmo domínio
  cognitoUserPoolsTokenProvider.setKeyValueStorage(
    new CookieStorage({
      domain:   env.VITE_COOKIE_DOMAIN,
      path:     "/",
      expires:  1,                              // dias
      secure:   env.VITE_ENV !== "development",
      sameSite: "lax",
    }),
  );
}
```

Chame `configureAmplify()` **uma vez** no `main.tsx`, antes de montar a app (ver §7).

### 2.2 Constantes

```ts
// src/constants.ts
export const HUB_URL = "https://hub.empresa.com";   // produto externo de login
```

### 2.3 Env vars

```ts
// src/env.ts (trecho — auth)
import { z } from "zod";

export const env = z.object({
  VITE_ENV:                  z.enum(["development", "staging", "production", "test"]).default("development"),
  VITE_API_BASE_URL:         z.string().url(),
  VITE_COGNITO_USER_POOL_ID: z.string().min(1),
  VITE_COGNITO_CLIENT_ID:    z.string().min(1),
  VITE_COGNITO_REGION:       z.string().min(1),
  VITE_COOKIE_DOMAIN:        z.string().min(1).default("localhost"),
  VITE_HUB_URL:              z.string().url(),
}).parse(import.meta.env);
```

> Nomes reais no repo: `VITE_COGNITO_CLIENT_ID` (não `APP_CLIENT_ID`) e `VITE_COOKIE_DOMAIN` (não `COGNITO_COOKIE_DOMAIN`). **Single pool por ambiente** — sem `VITE_COGNITO_HOMOLOG_*`.

---

## 3. AuthContext

Estado de auth fica em Context (não Zustand) — alinhado com padrão da empresa. **Toda a app é envolvida por `AuthProvider`** (em `src/contexts/auth-context.tsx`, fora de `lib/`).

```tsx
// src/contexts/auth-context.tsx
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Permission } from "@/lib/permissions/catalog";
import { parsePermissionsFromToken } from "@/lib/permissions/parse";
import { forceLogout, getIdTokenPayload, isAuthenticated } from "@/lib/auth";
import { type AuthUser, isTestEnv, TEST_AUTH } from "@/lib/auth/test-fixtures";

export type AuthState = {
  user: AuthUser | null;          // AuthUser = { id, email, name }
  permissions: Permission[];      // array de literais do catálogo (sem prefixo)
  isLoading: boolean;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    isTestEnv
      ? { user: TEST_AUTH.user, permissions: TEST_AUTH.permissions, isLoading: false, isAuthenticated: true }
      : { user: null, permissions: [], isLoading: true, isAuthenticated: false },
  );

  useEffect(() => {
    if (isTestEnv) return;
    let active = true;
    (async () => {
      const authed = await isAuthenticated();
      if (!authed) {
        if (active) setState({ user: null, permissions: [], isLoading: false, isAuthenticated: false });
        return;
      }
      const payload = await getIdTokenPayload();          // claims do idToken (authorities, sub, email, name)
      if (!active || !payload) return;
      setState({
        user: { id: payload.sub ?? "", email: payload.email ?? "", name: payload.name ?? payload.email ?? "" },
        permissions: parsePermissionsFromToken({ authorities: payload.authorities }),
        isLoading: false,
        isAuthenticated: true,
      });
    })();
    return () => { active = false; };
  }, []);

  // Sem sessão depois do load → forceLogout (vai pro Hub)
  useEffect(() => {
    if (isTestEnv) return;
    if (!state.isLoading && state.user === null) void forceLogout();
  }, [state.isLoading, state.user]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

export function usePermissions(): Permission[] {
  return useMemo(() => useAuth().permissions, [/* ... */]);
}
```

`parsePermissionsFromToken` vive em [`PERMISSIONS.md`](./PERMISSIONS.md). Note que `permissions` é um **`Permission[]`** (array de literais), não um objeto `{ hasAccess, list }`. O `user` é mínimo (`{ id, email, name }`), derivado do idToken — não há `fetchUserAttributes`.

### 3.1 Test fixtures

```ts
// src/lib/auth/test-fixtures.ts
import { env } from "@/env";
import { PERMISSIONS, type Permission } from "@/lib/permissions/catalog";

export const isTestEnv = env.VITE_ENV === "test";

export type AuthUser = { id: string; email: string; name: string };

/** Sessão fake usada quando VITE_ENV === "test" (sem Cognito real). */
export const TEST_AUTH: { token: string; user: AuthUser; permissions: Permission[] } = {
  token: "test-token",
  user: { id: "test-user", email: "test@b2breservas.com.br", name: "Test User" },
  permissions: [PERMISSIONS.HOSPITALITY.HOTEL_ADMIN],
};
```

> O catálogo tem só `HOTEL_ADMIN`, `HOTEL_STAFF`, `AGENCY_ADMIN`, `AGENCY_STAFF` (ver [`PERMISSIONS.md`](./PERMISSIONS.md)) — não há `APP_USER`/`SYS_ADMIN`. As fixtures são exports diretos (`TEST_AUTH`, `isTestEnv`), não funções factory.

---

## 4. Helpers

```ts
// src/lib/auth/index.ts
import {
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
  type GetCurrentUserOutput,
} from "aws-amplify/auth";
import { HUB_URL } from "@/constants";
import { env } from "@/env";

export async function getAuthUser(): Promise<GetCurrentUserOutput> {
  if (env.VITE_ENV === "test") {
    return { userId: "user-id", username: "John Doe" };
  }
  return getCurrentUser();
}

export async function getJwtToken(): Promise<string | undefined> {
  if (env.VITE_ENV === "test") return "JWT_TOKEN_TEST";
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error("no_id_token");
    return token;
  } catch {
    await forceLogout();
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (env.VITE_ENV === "test") return true;
  const session = await fetchAuthSession();
  return !!session.userSub;
}

export async function forceLogout(): Promise<void> {
  await amplifySignOut();
  window.location.href = HUB_URL;
}
```

---

## 5. Integração com a API (client wrapper)

O fetch wrapper que o Kubb consome vive em **`src/api/client.ts`** (ver [`KUBB.md` §6](./KUBB.md#6-client-customizado-wrapper-de-fetch) para o arquivo completo). O essencial pra auth:

```ts
// src/api/client.ts (trecho)
import { forceLogout, getJwtToken } from "@/lib/auth";

const token = await getJwtToken();
if (token) headers.set("Authorization", `${token}`);   // idToken cru, SEM prefixo "Bearer"

// ...
if (res.status === 401 && env.VITE_ENV !== "test") await forceLogout();
```

Pontos de auth:
- Token via `getJwtToken()` (idToken do Amplify), enviado **sem `Bearer`** (`Authorization: <token>`).
- `401` → `forceLogout()` (redireciona pro `HUB_URL`), exceto em test.
- `ApiError(status, statusText, data)` — payload de erro cru em `.data`.

> Amplify v6 cuida de **refresh automático** dos tokens via `fetchAuthSession()` (se o access expirou mas o refresh é válido, retorna o novo). Não implementamos refresh manual.

---

## 6. Guards de rota

**Não há layout pathless `_authenticated/`.** Cada rota protegida usa `beforeLoad: requireAuth` direto. O guard é **híbrido**: em dev/local não redireciona (o `AuthGate` mostraria o Authenticator); em staging/prod sem sessão → `HUB_URL`.

```ts
// src/lib/router/guards.ts
import { redirect } from "@tanstack/react-router";
import { HUB_URL } from "@/constants";
import { isAuthenticated } from "@/lib/auth";
import { isLocalAuth } from "@/lib/auth/local-auth";

export async function requireAuth(): Promise<void> {
  if (await isAuthenticated()) return;
  if (isLocalAuth) return;                      // Authenticator interno cuida do login em dev
  throw redirect({ href: HUB_URL });            // prod: login externo
}
```

```tsx
// src/routes/users/index.tsx — guard por rota
export const Route = createFileRoute("/users/")({
  beforeLoad: requireAuth,
  component: UsersPage,
});
```

> ⚠️ **Estado atual:** `requireAuth` existe mas a única rota guardada hoje é a home (`src/routes/index.tsx`), que **reimplementa o check inline** em vez de chamar `requireAuth`. Ao criar rotas protegidas, use `beforeLoad: requireAuth` para padronizar.

---

## 7. Bootstrap completo

```tsx
// src/main.tsx (estado atual do repo)
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { queryClient } from "@/api/query-client";
import { AuthProvider } from "@/contexts/auth-context";
import { configureAmplify } from "@/lib/auth/amplify";
import { i18n, initI18n } from "@/lib/i18n";
import "@/lib/i18n/types";
import { initObservability } from "@/lib/observability";
import { router } from "@/router";
import "@/styles/globals.css";

configureAmplify();
initObservability();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Elemento #root não encontrado");

initI18n().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>,
  );
});
```

> ⚠️ **O `AuthGate` ainda não está montado aqui.** O alvo é `AuthGate` envolvendo `AuthProvider` que envolve o Router — assim, em dev o Authenticator interno monta `AuthProvider`/Router só após o login. Para habilitar o login interno em dev, importe `{ AuthGate } from "@/components/shared/auth-gate"` e envolva o `<AuthProvider>` com `<AuthGate>`.

---

## 8. Logout

Botão de logout chama `forceLogout()`:

```tsx
import { forceLogout } from "@/lib/auth";

<Button onClick={() => void forceLogout()}>Sair</Button>
```

`forceLogout()`:
1. Chama `amplifySignOut()` (Amplify limpa cookies).
2. Redireciona pra `HUB_URL`.

No Hub o usuário pode logar com outra conta ou ir pra outro produto.

---

## 9. Test mode (e2e e local sem Hub)

Em ambientes onde o Hub não está disponível (CI de testes, dev offline), `VITE_ENV=test` faz bypass:

- `getJwtToken()` retorna `TEST_AUTH.token`
- `isAuthenticated()` sempre `true`
- `AuthProvider` injeta `TEST_AUTH.user` + `TEST_AUTH.permissions` (de `test-fixtures.ts`)
- `isLocalAuth` é `false` em test → o Authenticator interno **não** monta

**Nunca habilite em prod.** A validação no schema do `env.ts` garante que só os valores válidos passam.

---

## 10. Checklist de auth

- [ ] `configureAmplify()` chamado em `main.tsx` antes de montar a app
- [ ] Env vars `VITE_COGNITO_USER_POOL_ID` / `_CLIENT_ID` / `_REGION` validadas no schema do env (single pool por ambiente)
- [ ] CookieStorage configurado com domínio correto (não localStorage)
- [ ] `HUB_URL` em `src/constants.ts` apontando pro produto externo
- [ ] `AuthGate` → `AuthProvider` → `RouterProvider` (nessa ordem) no `main.tsx` — **hoje o `AuthGate` não está montado**; monte-o para login em dev
- [ ] `getJwtToken()` injeta token (sem `Bearer`) no `src/api/client.ts`
- [ ] 401 do backend chama `forceLogout()` (não tenta refresh manual)
- [ ] `requireAuth` no `beforeLoad` das rotas protegidas: dev não redireciona (Authenticator), prod manda pro HUB
- [ ] Authenticator interno só em dev/local (`isLocalAuth`), carregado via `lazy()` — fora do chunk de prod
- [ ] Sem rota `/login` ou `/auth/callback` internas em prod
- [ ] Sem self-service: nenhum `signUp`/`confirmSignUp`/`forgotPassword`/`reAuthenticate` no app
- [ ] Test fixtures isoladas em `test-fixtures.ts`, ativadas só com `VITE_ENV=test`
- [ ] Nenhum código manual de OAuth/PKCE — Amplify cuida
