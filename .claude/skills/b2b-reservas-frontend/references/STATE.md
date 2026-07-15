# STATE.md — Gerenciamento de Estado

> Server state ≠ UI state. **TanStack Query** cuida de tudo que vem da API (cache, sync, dedup, retry). **Zustand** entra apenas quando há UI state genuinamente compartilhado entre rotas. **React state** local cobre o resto.

---

## 1. Decisão por categoria

| Tipo de estado | Onde |
|---|---|
| Dados do servidor (lista de usuários, detalhe, settings persistidos) | **TanStack Query** |
| Filtros, paginação, ordenação, tab ativa em URL | **TanStack Router search params** |
| Form em edição | **React Hook Form** |
| Modal aberto/fechado, hover, foco (UI efêmero local) | **`useState`** local |
| Sidebar collapsed, theme, idioma (UI compartilhado entre rotas) | **Zustand** |
| Token de auth | **AWS Amplify v6 + CookieStorage** (cookies, não localStorage; veja [`AUTH.md`](./AUTH.md)) |

**Regra-mor:** dado que veio da API **sempre** mora em TanStack Query. Nunca copie para `useState`/Zustand.

---

## 2. TanStack Query — patterns essenciais

### 2.1 Setup do QueryClient — singleton global

**Existe UM queryClient em todo o app.** Criado uma vez em módulo top-level, importado pelo bootstrap e injetado no contexto do Router.

```tsx
// src/api/query-client.ts (estado atual do repo — config enxuta)
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,            // dados "frescos" por 30s
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

> A config atual é mínima (`staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`). As opções recomendadas abaixo (`gcTime`, retry condicional por status, `refetchOnReconnect`, `mutations.retry: false`) são um **alvo** a adicionar quando precisar:
>
> ```ts
> retry: (failureCount, error) =>
>   error instanceof ApiError && error.status < 500 ? false : failureCount < 2,
> ```

### 2.2 Provider no root + injeção no Router context

```tsx
// src/main.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/api/query-client";
import { router } from "@/router";

// Router recebe o queryClient via context — loaders chamam ensureQueryData nele
<QueryClientProvider client={queryClient}>
  <RouterProvider router={router} context={{ queryClient }} />
  {import.meta.env.DEV && <ReactQueryDevtools />}
</QueryClientProvider>
```

```ts
// src/router.tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes";
import type { QueryClient } from "@tanstack/react-query";

export const router = createRouter({
  routeTree,
  context: {
    queryClient: undefined!, // preenchido pelo Provider via RouterProvider
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0, // deixa o TanStack Query controlar
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface RouteContext {
    queryClient: QueryClient;
  }
}
```

### 2.3 Como acessar o queryClient

| Onde | Como |
|---|---|
| Em componente | `const queryClient = useQueryClient()` (hook, lê do Provider) |
| Em loader de rota | `loader: async ({ context }) => context.queryClient.ensureQueryData(...)` |
| Em handler fora de componente (raro) | Importe diretamente `import { queryClient } from "@/api/query-client"` |

**Nunca crie `new QueryClient()` num componente.** Isso descarta o cache global e recria do zero a cada render — bug clássico.

```tsx
// ❌ ERRADO — cria novo a cada render
function MyComponent() {
  const queryClient = new QueryClient();
  // ...
}

// ❌ ERRADO mesmo dentro do Provider — esconde o global
function NestedProvider() {
  const local = useMemo(() => new QueryClient(), []);
  return <QueryClientProvider client={local}>...</QueryClientProvider>;
}

// ✅ CORRETO
function MyComponent() {
  const queryClient = useQueryClient(); // lê o global do contexto
}
```

**Exceções legítimas para criar QueryClient novo:**
- **Em testes** — quer cache vazio entre testes, retry desligado, gc imediato. Use `renderWithProviders` que aceita config (ver [`TESTING.md`](./TESTING.md)).
- **SSR/SSG** — um por request server-side (não nosso caso atual).

### 2.4 Usar hooks gerados pelo Kubb

```tsx
const { data, isLoading, isError, error, refetch } = useListUsers({ page: 1 });
```

Veja [`KUBB.md`](./KUBB.md) para detalhes. (Nome do hook = `operationId`.)

### 2.5 Invalidar após mutation

```tsx
const queryClient = useQueryClient();
const { mutate } = useCreateUser({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: USERS.queryKeyRoot });
  },
});
```

**Granularidade:** as queryKeys do Kubb são **baseadas em objeto** (`[{ url, params? }]`). Invalide a coleção do módulo com `USERS.queryKeyRoot` (`[{ url: "/users" }]`); um item específico com `getUserQueryKey(userId)` (do hook gerado). Ver [`KUBB.md` §8](./KUBB.md#8-querykey-conventions).

### 2.6 Optimistic updates

Atualize a UI **antes** da resposta do servidor, com rollback em erro:

```tsx
import { getUserQueryKey } from "@/api/generated/hooks/usersHooks/useGetUser";

const { mutate } = useUpdateUser({
  onMutate: async ({ userId, data }) => {
    const key = getUserQueryKey(userId);           // [{ url: "/users/:id", params: { id: userId } }]
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (old: User) => ({ ...old, ...data }));
    return { previous, userId };
  },
  onError: (_err, _vars, context) => {
    if (context) {
      queryClient.setQueryData(getUserQueryKey(context.userId), context.previous);
      toast.error("Não foi possível atualizar; mudanças revertidas");
    }
  },
  onSettled: (_data, _err, { userId }) => {
    queryClient.invalidateQueries({ queryKey: getUserQueryKey(userId) });
  },
});
```

**Quando usar:** ações que o usuário espera ser "instantâneas" (toggle de favorito, marcar como lido, drag-and-drop).

**Quando NÃO usar:** ações destrutivas (delete), ações com side effects visíveis em outras telas, ações que dependem de validação de servidor crítica.

### 2.7 Pre-fetch via loader de rota

```tsx
export const Route = createFileRoute("/users/$userId/")({
  beforeLoad: requireAuth,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(
      getUserQueryOptions(params.userId),
    );
  },
  component: UserDetail,
});
```

Cache aquecido. Sem flicker de loading quando o componente monta.

### 2.8 Pagination

```tsx
const [page, setPage] = useState(1);
const { data, isPlaceholderData } = useListUsers(
  { page, pageSize: 20 },
  { placeholderData: (prev) => prev }, // keep previous data v5
);
```

`placeholderData: (prev) => prev` mantém dados anteriores visíveis enquanto carrega a próxima página. Evita flash de skeleton.

### 2.9 Infinite scroll

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";

const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ["users", "infinite"],
  queryFn: ({ pageParam = 1 }) => listUsers({ page: pageParam, pageSize: 20 }), // função pura do hook gerado
  initialPageParam: 1,
  getNextPageParam: (lastPage) =>
    lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
});

// data.pages é um array com cada página retornada
const allItems = data?.pages.flatMap((p) => p.items) ?? [];
```

Combine com `IntersectionObserver` para trigger automático no fim da lista.

### 2.10 Loading patterns

```tsx
// ❌ flash de loading mesmo quando dado já está no cache
{isLoading && <Skeleton />}

// ✅ pendingComponent na rota cobre o initial load; component só renderiza com data
function UserDetail() {
  const { userId } = Route.useParams();
  const { data: user } = useGetUser(userId); // garantido pelo loader

  return <UserCard user={user} />; // sem if(loading)
}
```

`useQuery` retorna `data: undefined | T` por default. Usando `loader` + `ensureQueryData`, podemos confiar que `data` está presente quando o componente monta. Para componentes sem loader, prefira:

```tsx
const { data, isLoading } = useQuery(...);
if (isLoading || !data) return <Skeleton />;
return <Content data={data} />;
```

---

## 3. TanStack Router search params como state

Filtros, paginação, ordenação, tabs — tudo na URL. Persiste em refresh, compartilhável por link, history funciona.

```tsx
// src/routes/users/index.tsx
import { z } from "zod";
import { requireAuth } from "@/lib/router/guards";

const searchSchema = z.object({
  search: z.string().optional(),
  role: z.enum(["admin", "user", "viewer"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  sortBy: z.enum(["name", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const Route = createFileRoute("/users/")({
  beforeLoad: requireAuth,
  validateSearch: searchSchema.parse,
  component: UsersPage,
});

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <>
      <Input
        defaultValue={search.search}
        onChange={(e) => {
          navigate({
            search: (prev) => ({ ...prev, search: e.target.value, page: 1 }),
          });
        }}
      />
      <UsersList filters={search} />
    </>
  );
}
```

**Padrões:**
- Reset `page: 1` ao mudar filtro.
- Debounce ao digitar em search (use lib ou `useDebounce`).
- Default values no schema evitam URLs feias (`?page=1` quando page é default).

---

## 4. Zustand — quando e como

### 4.1 Quando usar

- Sidebar collapsed que persiste entre rotas
- Theme (se não usar `next-themes`)
- Drawer/modal global que pode ser aberto de qualquer lugar
- Configurações de UI que vários componentes leem (densidade da tabela, view mode)

### 4.2 Quando NÃO usar

- Dados da API → TanStack Query
- Filtros/paginação → search params
- Estado de form → RHF
- Estado local de um componente → `useState`

### 4.3 Setup mínimo

```bash
pnpm add zustand
```

```ts
// src/stores/ui-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "ui-store" }, // localStorage key
  ),
);
```

### 4.4 Uso

```tsx
function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  // ...
}
```

**Selecionar slice mínimo** (`s => s.sidebarCollapsed`) evita re-renders desnecessários.

### 4.5 Stores específicas, não monolíticas

Um store por **domínio de UI**:
- `useUiStore` — layout (sidebar, density, etc)
- `useTableStore` — preferences de tabela (colunas visíveis)
- `useCommandPaletteStore` — palette state

Evite "global app store" — vira gargalo de manutenção.

---

## 5. Comunicação entre componentes não-relacionados

**Problema:** componente A em uma rota dispara evento; componente B em outra rota precisa reagir.

**Soluções (em ordem de preferência):**

1. **TanStack Query invalidation** se for dado. A criou → invalida query → B refetch.
2. **Zustand store** se for UI state genuíno.
3. **Custom event** (último recurso, raro): `window.dispatchEvent` + listener.

```tsx
// Antipattern comum, evite
const [trigger, setTrigger] = useState(0);
useEffect(() => { /* re-fetch */ }, [trigger]);
```

Use TanStack Query corretamente.

---

## 6. Persistência entre sessões

| Dado | Onde |
|---|---|
| Preferências UI (sidebar, theme) | Zustand `persist` middleware → localStorage |
| Tokens de auth | Amplify v6 → CookieStorage (cookies, não localStorage; veja [`AUTH.md`](./AUTH.md)) |
| Filtros recentes | TanStack Query + URL (se cabível) |
| Form draft (rascunho) | `useFormPersist` ou localStorage manual com debounce |
| Dados sensíveis | **Nunca** localStorage; só memória |

---

## 7. Sincronização entre abas

Quando você quer que mudança em uma aba reflita em outra (logout, mudança de role):

> Os tokens vivem em **cookies** (Amplify CookieStorage), não em localStorage, então o `storage` event não dispara no logout. Para sincronizar logout entre abas, prefira `BroadcastChannel` (§7.2). O logout redireciona pro `HUB_URL` (não há rota `/login` interna).

### 7.1 `storage` event (cross-tab via localStorage)

```ts
// Útil para preferências de UI persistidas (Zustand), não para tokens (que estão em cookies).
window.addEventListener("storage", (e) => {
  if (e.key === "ui-store") {
    /* outra aba mudou preferências de UI */
  }
});
```

### 7.2 `BroadcastChannel` (mais moderno) — sincronizar logout

```ts
import { HUB_URL } from "@/constants";

const bc = new BroadcastChannel("app");
bc.postMessage({ type: "logout" });
bc.addEventListener("message", (e) => {
  if (e.data.type === "logout") {
    queryClient.clear();
    window.location.href = HUB_URL;   // login externo; sem /login interna
  }
});
```

---

## 8. Patterns importantes

### 8.1 Selectors estáveis em Zustand

```tsx
// ❌ retorna novo objeto a cada render → re-render infinito
const { x, y } = useStore((s) => ({ x: s.x, y: s.y }));

// ✅ selectors individuais
const x = useStore((s) => s.x);
const y = useStore((s) => s.y);

// ✅ ou shallow comparator (zustand/shallow)
import { useShallow } from "zustand/react/shallow";
const { x, y } = useStore(useShallow((s) => ({ x: s.x, y: s.y })));
```

### 8.2 Não inicialize TanStack Query num useEffect

```tsx
// ❌
useEffect(() => {
  queryClient.fetchQuery(...);
}, []);

// ✅ use o hook no top level
const { data } = useQuery(...);
```

### 8.3 Não chame hooks dentro de callbacks

```tsx
// ❌
<Button onClick={() => {
  const { data } = useGetUser(id); // ERRO
}}>
```

Hooks só no top level. Para mutations, use `useMutation` no top level e `mutate()` no callback.

---

## 9. Debugging

- **React Query Devtools** — habilitado em dev. Mostra todas as queries, cache, refetch, invalidate.
- **TanStack Router Devtools** — idem para rotas, params, loader state.
- **Redux DevTools** funciona com Zustand:
  ```ts
  import { devtools } from "zustand/middleware";
  create(devtools((set) => ({ ... }), { name: "ui-store" }));
  ```

---

## 10. Checklist de state

- [ ] Dados de API estão em TanStack Query (não copiados para `useState`)
- [ ] Filtros/paginação estão em search params (não em `useState` perdido em refresh)
- [ ] Form usa React Hook Form (não `useState` por campo)
- [ ] Zustand store específica do domínio (não god-object)
- [ ] Selector Zustand seleciona slice mínimo
- [ ] Mutations invalidam queries certas no `onSuccess`
- [ ] Optimistic update tem rollback em `onError`
- [ ] Sem `useEffect` para fetch de dados (use hooks gerados)
- [ ] Pre-fetch via loader em rotas pesadas
- [ ] Devtools removidos em prod (`import.meta.env.DEV`)
