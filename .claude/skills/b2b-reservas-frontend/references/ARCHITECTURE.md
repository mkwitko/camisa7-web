# ARCHITECTURE.md — Camadas, módulos, padrões

> Como o código do frontend é organizado e por quê. **Por módulo, não vertical slice** — `components/users/`, `hooks/users/`, `schemas/users/`. Cada tipo de coisa fica num lugar, agrupada por módulo de negócio.

---

## 1. Princípios

1. **File-based routing.** A árvore de `src/routes/` espelha as URLs. Adicionar página = criar arquivo.
2. **Organização por módulo dentro de cada tipo.** `components/users/`, `hooks/users/`, `schemas/users/`. Quem busca "todos os componentes" tem um lugar. Quem busca "todos os hooks de users" também tem.
3. **Separação clara entre server state e UI state.** TanStack Query cuida do primeiro; React state ou Zustand do segundo.
4. **API client é gerado, não escrito.** Kubb lê o OpenAPI e gera tudo (ver [`KUBB.md`](./KUBB.md)).
5. **Composição de primitives.** shadcn em `components/ui/`; módulos compõem por cima.
6. **Filenames em kebab-case.** `user-form.tsx`, `use-cancel-booking.ts`. Componente exportado continua PascalCase (`UserForm`).

---

## 2. Estrutura de pastas

```
src/
├── main.tsx                    # bootstrap (Amplify + i18n + observability + Router)
├── router.tsx                  # createRouter (importa a árvore de ./routes)
├── routes.ts                   # GERADO pelo TanStack Router (@ts-nocheck) — não é routeTree.gen.ts
├── constants.ts                # constantes globais (HUB_URL, etc.)
├── env.ts                      # validação de env vars com Zod
│
├── routes/                     # file-based routing (URLs) — leaf = <segmento>/index.tsx
│   ├── __root.tsx              # layout raiz (providers + sidebar + <Outlet/>)
│   ├── index.tsx               # rota /  (beforeLoad faz o guard de auth)
│   └── users/                  # ex. de módulo (URLs)
│       ├── index.tsx           # /users (lista)
│       ├── new/index.tsx       # /users/new
│       └── $userId/index.tsx   # /users/:userId
│   # rotas protegidas usam `beforeLoad: requireAuth` (de @/lib/router/guards)
│   # NÃO há layout pathless _authenticated/ nem rota /forbidden
│
├── api/                        # API CLIENT (Kubb) — fora de lib/
│   ├── client.ts               # fetch wrapper (injeta JWT via Amplify; forceLogout no 401)
│   ├── query-client.ts         # QueryClient singleton
│   ├── modules/                # constantes por módulo (USERS.ENDPOINT, queryKeyRoot)
│   │   ├── index.ts            # barrel
│   │   └── users.ts
│   └── generated/              # GERADO pelo Kubb (gitignored)
│       ├── hooks/<tag>Hooks/   # ex.: usersHooks/, rfpHooks/, undefinedHooks/ (sem tag)
│       ├── types/
│       └── index.ts
│
├── components/                 # COMPONENTES — por módulo
│   ├── ui/                     # shadcn primitives (kebab-case por padrão do CLI)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   └── ...
│   ├── layout/                 # app-sidebar.tsx, app-header.tsx, app-container.tsx
│   ├── shared/                 # compartilhados entre módulos (não-UI primitives)
│   │   ├── auth-gate.tsx       # dev=Authenticator (lazy) / prod=passthrough
│   │   ├── can.tsx             # <Can> de permissões
│   │   ├── empty-state.tsx
│   │   ├── error-state.tsx
│   │   └── image.tsx
│   ├── users/                  # módulo users
│   │   ├── user-form.tsx
│   │   ├── users-list.tsx
│   │   ├── user-detail.tsx
│   │   └── user-avatar.tsx
│   └── bookings/               # módulo bookings
│       ├── booking-card.tsx
│       ├── bookings-list.tsx
│       └── cancel-booking-dialog.tsx
│
├── contexts/                   # React contexts
│   └── auth-context.tsx        # AuthProvider, useAuth, usePermissions
│
├── hooks/                      # HOOKS — só common/ hoje; hooks/<módulo>/ quando precisar
│   └── common/                 # hooks reutilizáveis (não-módulo)
│       ├── use-debounce.ts
│       ├── use-format.ts       # datas/moedas/i18n
│       └── use-mobile.ts
│
│   # schemas/<módulo>/ (Zod) é criado quando um módulo ganha forms — ainda não existe
│
├── lib/                        # INFRA — não-módulo
│   ├── auth/
│   │   ├── amplify.ts             # configureAmplify() + CookieStorage
│   │   ├── local-auth.ts          # isLocalAuth flag (dev/localhost)
│   │   ├── local-authenticator.tsx# UI login interna dev-only (@aws-amplify/ui-react)
│   │   ├── index.ts               # getJwtToken, getIdTokenPayload, isAuthenticated, forceLogout
│   │   └── test-fixtures.ts       # fixtures pra VITE_ENV=test
│   ├── permissions/
│   │   ├── catalog.ts          # PERMISSIONS.HOSPITALITY.*, AUTHORITIES_KEY
│   │   ├── parse.ts            # parsePermissionsFromToken
│   │   ├── use-can.ts          # useCan, useCanAny, useCanAll
│   │   └── persona-groups.ts   # ADMIN_PERSONAS, HOTEL_PERSONAS, etc.
│   ├── datetime/               # formatação UTC↔fuso, parse
│   │   ├── format.ts
│   │   ├── parse.ts
│   │   └── timezone.ts
│   ├── i18n/                   # init i18next + types.d.ts
│   ├── observability/          # sentry, posthog, web-vitals
│   ├── router/                 # guards.ts (requireAuth)
│   └── utils.ts                # cn() etc.
│
├── stores/                     # Zustand stores (UI state compartilhado)
│   └── ui-store.ts             # sidebarOpen, etc.
│
├── utils/                      # helpers de domínio puros (ex.: amenities.ts)
│
└── styles/
    └── globals.css             # Tailwind v4 (@import + @theme)

test/
├── e2e/                        # Playwright (testDir; specs sob demanda)
├── integration/                # testes de integração (scaffold; ainda vazio)
├── mocks/                      # MSW (handlers.ts, server.ts, browser.ts)
└── setup.ts                    # vitest setup (i18n + MSW server)

public/                         # assets estáticos
├── favicon.ico
└── locales/
    └── pt-BR/
        ├── common.json
        ├── users.json
        ├── bookings.json
        └── ...

components.json                 # config shadcn
vite.config.ts                  # + config do Vitest (test: {...})
tsconfig.json
biome.json
playwright.config.ts
kubb.config.ts
api.json                        # OpenAPI fixture commitada (input do Kubb)

docker/
├── Dockerfile                  # SÓ prod (Nginx servindo dist/)
└── nginx.conf                  # SPA fallback + cache de assets
                                # Dev é pnpm dev local — sem container

infra/                          # AWS CDK
├── bin/app.ts
└── lib/
    ├── static-site-stack.ts
    └── pipeline-stack.ts

.claude/skills/b2b-reservas-frontend/   # docs detalhados (você está aqui)
```

---

## 3. Por que organização por módulo (não vertical slice)

| Vertical slice (`features/users/`) | Por módulo (escolha) |
|---|---|
| Tudo de uma feature num lugar | Cada tipo de coisa num lugar |
| Mover/remover feature inteira é fácil | Encontrar "todos os componentes" é fácil |
| Acoplamento intra-feature implícito | Acoplamento entre tipos é explícito (import claro) |
| Onboarding precisa explicar onde tudo mora | Padrão familiar (Rails, Django) |

A escolha foi por módulo porque:
- Devs entram/saem do projeto e precisam achar `components/` direto.
- Refactor cross-módulo (mover `UserAvatar` pra `shared/`) é mais natural.
- Vertical slice tende a virar "mini-app" com inconsistência interna.

**Regras:**
- Componente do módulo X **pode** importar de `components/shared/`, `components/ui/`, `lib/`, `hooks/common/`.
- Componente do módulo X **não deve** importar de `components/<outro-módulo>/`. Se precisar, candidato a `components/shared/`.

---

## 4. Roteamento — TanStack Router file-based

### 4.1 Convenções de arquivo

Pasta `src/routes/`:

```
routes/
├── __root.tsx                          # root layout (providers + sidebar + <Outlet/>)
├── index.tsx                           # /
└── users/                              # módulo (URLs)
    ├── index.tsx                       # /users
    ├── new/index.tsx                   # /users/new
    └── $userId/index.tsx               # /users/:userId
```

> **Convenção: subpasta + `index.tsx`, em vez de `.` no filename.** TanStack Router aceita ambos (`users.$userId.tsx` ≡ `users/$userId/index.tsx`). Escolhemos **subpasta com `index.tsx`** (o padrão usado no repo, ex.: `rfp/$alphaId/index.tsx`) porque legibilidade e Git diff são melhores. A árvore é gerada em **`src/routes.ts`** (com `@ts-nocheck`) — não é `routeTree.gen.ts`.

> **Não há layout pathless `_authenticated/` nem rota `/forbidden`.** Rotas protegidas fazem o guard direto no `beforeLoad` (ver 4.2).

### 4.2 Login híbrido — sem rota `/login` em prod, guard no `beforeLoad`

Amplify v6 + Cognito. O guard fica em cada rota protegida via `beforeLoad`, usando `requireAuth()` de `@/lib/router/guards`:

```ts
// src/lib/router/guards.ts
export async function requireAuth(): Promise<void> {
  if (await isAuthenticated()) return;
  if (isLocalAuth) return;              // Authenticator interno cuida do login em dev
  throw redirect({ href: HUB_URL });    // staging/prod sem sessão → hub externo
}
```

**Prod/staging:** login externo (Hub corporativo); `requireAuth` redireciona via `HUB_URL` — sem rota `/login` interna. **Dev/local:** o `AuthGate` (`@/components/shared/auth-gate.tsx`) mostra um Authenticator interno (`@aws-amplify/ui-react`, lazy) pra não depender do Hub; `requireAuth` não redireciona quando `isLocalAuth`. Sem self-service (signup/forgot/reauth). Detalhes em [`AUTH.md`](./AUTH.md).

### 4.3 Anatomia de uma rota

```tsx
// src/routes/users/$userId/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getRfpQueryOptions } from "@/api/generated/hooks/usersHooks/useGetUser";
import { requireAuth } from "@/lib/router/guards";
import { UserDetail } from "@/components/users/user-detail";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/users/$userId/")({
  beforeLoad: requireAuth,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(
      getUserQueryOptions(params.userId),
    );
  },
  component: UserDetailRoute,
  pendingComponent: () => <Skeleton className="h-96" />,
  errorComponent: ({ error }) => <UserDetailError error={error} />,
});

function UserDetailRoute() {
  const { userId } = Route.useParams();
  const { data: user } = useGetUser(userId);
  return <UserDetail user={user} />;
}
```

> Hooks gerados expõem `get<Op>QueryOptions(...)` para pré-busca no loader (ver [`KUBB.md`](./KUBB.md)). O nome do hook é o `operationId` (`useGetUser`), não `useUsersGetUser`.

### 4.4 Type-safety de params e search

```tsx
const Route = createFileRoute("/users/$userId/")({
  validateSearch: z.object({
    tab: z.enum(["profile", "bookings"]).default("profile"),
    page: z.coerce.number().int().min(1).default(1),
  }).parse,
  component: UserDetailRoute,
});

function UserDetailRoute() {
  const { tab, page } = Route.useSearch();      // tipado
  const navigate = Route.useNavigate();
  navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) });
}
```

Compilador rejeita typo e tipo errado. (O repo também usa `nuqs` via `NuqsAdapter` no `__root.tsx` para sincronizar estado de UI com a URL quando search params da rota não bastam.)

### 4.5 Root layout — `__root.tsx`

Não há layout pathless `_authenticated/`. O shell da app vive no root e cada rota guarda a si mesma no `beforeLoad`:

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const RootLayout = () => (
  <NuqsAdapter>
    <TooltipProvider>
      <SidebarProvider className="p-2">
        <AppSidebar />
        <SidebarInset className="pl-2">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  </NuqsAdapter>
);

export const Route = createRootRoute({ component: RootLayout });
```

> O `AuthProvider` (de `@/contexts/auth-context`) e o `AuthGate` envolvem o `RouterProvider` em `main.tsx`, não no `__root.tsx`. Ver [`AUTH.md`](./AUTH.md).

---

## 5. Anatomia de um módulo

Exemplo: gerenciar usuários.

```
src/
├── components/users/
│   ├── users-list.tsx
│   ├── user-detail.tsx
│   ├── user-form.tsx
│   ├── delete-user-dialog.tsx
│   └── user-avatar.tsx
├── hooks/users/
│   ├── use-users-filters.ts
│   └── use-delete-user.ts
├── schemas/users/
│   ├── create-user.schema.ts
│   └── update-user.schema.ts
└── routes/users/
    ├── index.tsx
    ├── new/index.tsx
    └── $userId/index.tsx
```

> `hooks/users/` e `schemas/users/` são criados só quando o módulo precisa deles (hoje nenhum módulo tem — `hooks/` só tem `common/`).

**Regras:**
- Componentes de módulo **podem** importar de `@/components/ui/*`, `@/components/shared/*`, `@/lib/*`, `@/api/*`, `@/hooks/common/*`, e hooks gerados pelo Kubb.
- Componentes de módulo **não devem** ser importados por outros módulos (acoplamento horizontal). Se acontecer, candidato a `components/shared/`.
- Schemas Zod ficam **no módulo**, não compartilhados — formulários têm regras diferentes mesmo para o mesmo recurso (criar vs editar).

### 5.1 Componente típico

```tsx
// src/components/users/users-list.tsx
import { useTranslation } from "react-i18next";
import { useListUsers } from "@/api/generated/hooks/usersHooks/useListUsers";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { columns } from "./users-list-columns";

type Props = {
  filters: { search?: string; page: number };
};

export function UsersList({ filters }: Props) {
  const { t } = useTranslation("users");
  const { data, isLoading } = useListUsers({
    search: filters.search,
    page: filters.page,
    pageSize: 20,
  });

  if (isLoading) return <DataTable.Skeleton rows={10} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/users/new">{t("list.actions.new")}</Link>
        </Button>
      </div>
      <DataTable columns={columns} data={data.items} />
    </div>
  );
}
```

**Princípios:**
- Filename em kebab-case (`users-list.tsx`); export em PascalCase (`UsersList`).
- Recebe **props mínimas** (geralmente apenas filtros parseados).
- Chama hook gerado pelo Kubb (`useListUsers` — nome = `operationId`) — não cria `queryFn` à mão.
- Texto visível via `t()` — nada hardcoded ([`I18N.md`](./I18N.md)).
- Sem `useState` para dados de servidor (TanStack Query é a fonte da verdade).

---

## 6. Page composition

Página = rota + composição de componentes do módulo. **Mantenha-a fina.**

```tsx
// src/routes/users/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { UsersList } from "@/components/users/users-list";
import { AppHeader } from "@/components/layout/app-header";
import { requireAuth } from "@/lib/router/guards";

const searchSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const Route = createFileRoute("/users/")({
  beforeLoad: requireAuth,
  validateSearch: searchSchema.parse,
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation("users");
  const filters = Route.useSearch();
  return (
    <>
      <AppHeader title={t("list.title")} />
      <UsersList filters={filters} />
    </>
  );
}
```

---

## 7. Hooks customizados

### 7.1 Hooks gerados pelo Kubb — não escreva à mão

```tsx
import { useCreateUser } from "@/api/generated/hooks/usersHooks/useCreateUser";

const { mutate: createUser, isPending } = useCreateUser({
  onSuccess: () => {
    toast.success(t("feedback.created"));
    navigate({ to: "/users" });
  },
});
```

### 7.2 Hooks customizados — quando criar

Crie hook custom quando:
- **Compõe** múltiplos hooks gerados.
- Adiciona **side effects** (analytics, toast, invalidação composta).
- Encapsula **lógica de UI complexa** reutilizada.

```ts
// src/hooks/users/use-delete-user.ts
import { useDeleteUser as useDeleteUserGenerated } from "@/api/generated/hooks/usersHooks/useDeleteUser";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { USERS } from "@/api/modules";

export function useDeleteUser() {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useDeleteUserGenerated({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS.queryKeyRoot });
      toast.success(t("feedback.deleted"));
      navigate({ to: "/users" });
    },
    onError: () => {
      toast.error(t("feedback.deleteError"));
    },
  });
}
```

> `USERS.queryKeyRoot` em vez de string crua — ver [`KUBB.md` §8](./KUBB.md#8-querykey-conventions).

### 7.3 Não escreva wrappers inúteis

```ts
// ❌ wrapper que só repassa
export function useGetUser(id: string) {
  return useGetUserGenerated(id);
}
```

Use o gerado direto.

---

## 8. State management

Decisão por categoria:

| Tipo de estado | Onde |
|---|---|
| Server data | TanStack Query (via hooks Kubb) |
| URL state (filtros, paginação) | TanStack Router search params |
| Form state | React Hook Form |
| UI efêmero local (modal, hover) | `useState` |
| UI compartilhado entre rotas | Zustand (`src/stores/`) |
| Auth/permissões | `AuthContext` (Amplify v6) — ver [`AUTH.md`](./AUTH.md) |
| Timezone override | Zustand persistido — ver [`DATES.md`](./DATES.md) |

Detalhes em [`STATE.md`](./STATE.md).

**Regra-mor:** server state **nunca** em `useState`/Zustand. Sempre TanStack Query.

**QueryClient é singleton.** Um único `queryClient` em `src/api/query-client.ts` (`staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`). Nunca crie `new QueryClient()` dentro de componente. Exceção: testes.

---

## 9. Tratamento de erros

### 9.1 Erros de API

```tsx
const { data, error, isError } = useListUsers();
if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
```

### 9.2 Erros de rota

```tsx
export const Route = createFileRoute("/users/$userId")({
  component: UserDetail,
  errorComponent: ({ error, reset }) => (
    <div className="p-8 text-center">
      <p>{t("common:errors.generic")}</p>
      <Button onClick={reset}>{t("common:actions.tryAgain")}</Button>
    </div>
  ),
});
```

### 9.3 Erros globais

Sentry é inicializado em `main.tsx` via `initObservability()` (de `@/lib/observability`). Um ErrorBoundary do Sentry no topo da árvore é recomendado, mas **ainda não está montado** no `__root.tsx`. Detalhes em [`OBSERVABILITY.md`](./OBSERVABILITY.md).

---

## 10. Checklist para uma feature nova

- [ ] Rota criada em `src/routes/...` (subpasta + `index.tsx`); params/search validados por Zod; `beforeLoad: requireAuth` se protegida
- [ ] `components/<modulo>/` com filenames kebab-case (`my-component.tsx`)
- [ ] `hooks/<modulo>/` com hooks customizados se necessário (`use-x.ts`)
- [ ] `schemas/<modulo>/` com schemas Zod se o módulo tiver forms (mensagens via chaves i18n — [`FORMS.md`](./FORMS.md))
- [ ] Componente principal recebe filtros já parseados como props
- [ ] Usa hooks gerados pelo Kubb (sem `fetch` manual)
- [ ] Skeleton durante loading, ErrorState em erro
- [ ] Forms via React Hook Form + Zod resolver
- [ ] Mutations invalidam queries certas via `USERS.queryKeyRoot` (por módulo, não string crua)
- [ ] Permissões via `useCan(PERMISSIONS.HOSPITALITY.X)` — nunca string ad-hoc ([`PERMISSIONS.md`](./PERMISSIONS.md))
- [ ] Toast de feedback em mutations (sonner ou shadcn `useToast`)
- [ ] Texto via `t()` — nada hardcoded ([`I18N.md`](./I18N.md))
- [ ] Teste de integração (Vitest + Testing Library + MSW) cobrindo happy + erro + permissão errada
- [ ] Sem `any`, sem `console.log`, sem `useState` para dados de API
- [ ] Acessibilidade: labels em forms, `aria-*` em ícones-botão
- [ ] Bundle size verificado se feature pesada (`pnpm analyze`)
