# PERMISSIONS.md — Permissões no Frontend (padrão persona)

> Padrão da empresa: as personas vêm do **claim `authorities` do idToken** (JSON com mapa por domínio). Frontend decodifica direto — sem chamada extra ao backend. **Toda checagem usa variável do catálogo, nunca string literal.**

> **Leia também:** [`AUTH.md`](./AUTH.md) (Amplify v6 + AuthContext), [`backend/docs/INTEGRATIONS.md` §2.5](../../backend/docs/INTEGRATIONS.md#25-autorização-permissões--padrão-persona) e [`backend/docs/DECISIONS.md` ADR-022](../../backend/docs/DECISIONS.md#adr-022-padrão-persona-para-permissões-sem-ações-finas).

---

## 1. Princípios

1. **Backend valida; frontend orienta.** Esconder o botão não impede a chamada — backend rejeita com 403. Frontend só evita o usuário gastar clique inútil.
2. **Tudo é persona.** Strings descrevem *quem o usuário é* (`HOTEL_ADMIN`, `AGENCY_STAFF`). Não criamos ações finas (`BOOKING:CREATE`, `USERS:DELETE`) — ver ADR-022 do backend.
3. **Catálogo replicado no front.** Para usar **variáveis** (`PERMISSIONS.HOSPITALITY.HOTEL_ADMIN`) em vez de strings ad-hoc, mantemos o catálogo em código (`catalog.ts`). O tipo `Permission` é derivado desse objeto — **não vem do Kubb** (não há plugin Zod/permissões no Kubb deste repo).
4. **Permissões vêm do idToken.** Decode via Amplify (`fetchAuthSession().tokens.idToken.payload.authorities`). Sem chamada `GET /me/permissions` — padrão da empresa.
5. **`useCan(persona)` é a única forma de checar.** Sem `permissions.includes('...')` espalhado, sem `if (isAdmin)`. Sempre via hook + variável do catálogo.
6. **Falha fechada.** Em dúvida (loading, claims malformados), **não** exibe a ação.

---

## 2. Catálogo — replicado no front, com guarda de tipo

```ts
// src/lib/permissions/catalog.ts
/**
 * As permissões chegam no idToken pela claim `authorities`, no formato
 * `HOSPITALITY:HOTEL_ADMIN`. O parser remove o prefixo do namespace.
 * O tipo `Permission` é DEFINIDO AQUI (derivado do objeto) — não vem do Kubb.
 */
export const PERMISSION_NAMESPACE = "HOSPITALITY";
export const AUTHORITIES_KEY = "authorities";        // nome da claim no idToken

export const PERMISSIONS = {
  HOSPITALITY: {
    HOTEL_ADMIN:  "HOTEL_ADMIN",
    HOTEL_STAFF:  "HOTEL_STAFF",
    AGENCY_ADMIN: "AGENCY_ADMIN",
    AGENCY_STAFF: "AGENCY_STAFF",
  },
} as const;

export type Permission =
  (typeof PERMISSIONS)["HOSPITALITY"][keyof (typeof PERMISSIONS)["HOSPITALITY"]];

/** Lista plana de todas as personas válidas (para filtragem do JWT). */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(
  PERMISSIONS.HOSPITALITY,
);

/** Type guard: a string é uma permissão conhecida? */
export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
```

> ⚠️ **`Permission` é definido localmente** (derivado de `PERMISSIONS`), **não importado do Kubb** — o `kubb.config.ts` não gera tipo de permissão. `AUTHORITIES_KEY` é a **claim** (`"authorities"`), e `PERMISSION_NAMESPACE` (`"HOSPITALITY"`) é o prefixo removido pelo parser. Hoje há **4 personas**: `HOTEL_ADMIN`, `HOTEL_STAFF`, `AGENCY_ADMIN`, `AGENCY_STAFF` (não `APP_USER`/`SYS_ADMIN`/`HOTEL_CHAIN_ADMIN`/`BOOKING_VIEWER`).

**Quando o backend adicionar uma persona** (`FRANCHISEE_ADMIN`, por exemplo): adicione o valor no objeto `PERMISSIONS.HOSPITALITY` em `catalog.ts` — o tipo `Permission` e `ALL_PERMISSIONS` se atualizam sozinhos. Convenção: PR pareado com o backend (que emite a persona no claim).

---

## 3. Tipo de retorno

`parsePermissionsFromToken` devolve um **`Permission[]`** (array simples, deduplicado), não um objeto `{ hasAccess, list }`. O `AuthState` do contexto guarda esse array em `permissions` (ver [`AUTH.md`](./AUTH.md)). "Tem acesso" = `permissions.length > 0`.

---

## 4. Parser — extrai do idToken

Função pura: recebe o `idToken.payload`, devolve `Permission[]`. Chamada uma vez no boot, dentro do `AuthProvider`.

```ts
// src/lib/permissions/parse.ts
import { AUTHORITIES_KEY, isPermission, PERMISSION_NAMESPACE, type Permission } from "./catalog";

export function parsePermissionsFromToken(
  payload: Record<string, unknown> | undefined | null,
): Permission[] {
  if (!payload) return [];

  // A claim `authorities` chega como string "HOSPITALITY:HOTEL_ADMIN,..." ou array.
  const raw = payload[AUTHORITIES_KEY];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\s]+/)
      : [];

  const prefix = `${PERMISSION_NAMESPACE}:`;       // "HOSPITALITY:"
  const permissions = new Set<Permission>();

  for (const item of list) {
    if (typeof item !== "string") continue;
    const value = item.startsWith(prefix) ? item.slice(prefix.length) : item;
    if (isPermission(value)) permissions.add(value);   // filtra contra o catálogo
  }

  return [...permissions];
}
```

**Filtragem é importante:** tokens fora do catálogo (legacy, typos, personas de outros domínios) são descartados silenciosamente. O prefixo `HOSPITALITY:` é removido; aceita itens com ou sem prefixo.

---

## 5. Hook `useCan` — única forma de checar

```ts
// src/lib/permissions/use-can.ts
import { usePermissions } from "@/contexts/auth-context";
import type { Permission } from "./catalog";

export function useCan(permission: Permission): boolean {
  const permissions = usePermissions();          // Permission[]
  return permissions.includes(permission);
}

export function useCanAny(required: readonly Permission[]): boolean {
  const permissions = usePermissions();
  return required.some((p) => permissions.includes(p));
}

export function useCanAll(required: readonly Permission[]): boolean {
  const permissions = usePermissions();
  return required.every((p) => permissions.includes(p));
}
```

`usePermissions()` (de `@/contexts/auth-context`) devolve o `Permission[]` do contexto. `useCanAny` é o caso comum — espelha como o backend declara (`config.permissions.any: [...]`).

### 5.1 Uso típico — **sempre com variável**

```tsx
import { useCanAny } from "@/lib/permissions/use-can";
import { PERMISSIONS } from "@/lib/permissions/catalog";

function BookingActions({ booking }: { booking: Booking }) {
  // ✅ usa variáveis do catálogo
  const canManage = useCanAny([
    PERMISSIONS.HOSPITALITY.HOTEL_ADMIN,
    PERMISSIONS.HOSPITALITY.AGENCY_ADMIN,
  ]);

  return (
    <div className="flex gap-2">
      <Button variant="outline">Ver detalhes</Button>
      {canManage && booking.status === "confirmed" && (
        <Button variant="destructive" onClick={cancel}>Cancelar</Button>
      )}
    </div>
  );
}
```

```tsx
// ❌ NUNCA — string literal ad-hoc
const canManage = useCan("HOTEL_ADMIN");

// ❌ NUNCA — string literal mesmo em array
const canManage = useCanAny(["HOTEL_ADMIN", "AGENCY_ADMIN"]);
```

**Por que.** O catálogo é fonte única; usar string literal:
- Quebra rename refactor (IDE não acha)
- Não pega typo
- Cria divergência se o backend renomear

Biome rule pode ajudar (`no-restricted-syntax`) — em revisão.

---

## 6. Listas reutilizáveis

Quando a mesma combinação de personas aparece em > 3 lugares, extraia:

```ts
// src/lib/permissions/persona-groups.ts (estado atual do repo)
import { PERMISSIONS, type Permission } from "./catalog";

export const ADMIN_PERSONAS: readonly Permission[] = [
  PERMISSIONS.HOSPITALITY.HOTEL_ADMIN,
  PERMISSIONS.HOSPITALITY.AGENCY_ADMIN,
];

export const HOTEL_PERSONAS: readonly Permission[] = [
  PERMISSIONS.HOSPITALITY.HOTEL_ADMIN,
  PERMISSIONS.HOSPITALITY.HOTEL_STAFF,
];

export const AGENCY_PERSONAS: readonly Permission[] = [
  PERMISSIONS.HOSPITALITY.AGENCY_ADMIN,
  PERMISSIONS.HOSPITALITY.AGENCY_STAFF,
];

/** Personas que podem gerenciar usuários (alias de ADMIN_PERSONAS). */
export const MANAGE_USERS_PERSONAS: readonly Permission[] = ADMIN_PERSONAS;
```

Os grupos atuais são `ADMIN_PERSONAS`, `HOTEL_PERSONAS`, `AGENCY_PERSONAS` e `MANAGE_USERS_PERSONAS` (não `MANAGE_BOOKING_PERSONAS`/`READ_BOOKING_PERSONAS`/`ANY_ADMIN_PERSONAS`).

Uso:

```tsx
import { useCanAny } from "@/lib/permissions/use-can";
import { ADMIN_PERSONAS } from "@/lib/permissions/persona-groups";

const canManage = useCanAny(ADMIN_PERSONAS);
```

**Mantenha sincronizado com o backend.** Se o endpoint backend usa `any: [HOTEL_ADMIN, AGENCY_ADMIN]`, a constante `ADMIN_PERSONAS` deve ter exatamente os mesmos itens. Pode parecer duplicação — é. Backend precisa saber quem **pode efetivar**; front precisa saber quem **pode tentar** pra mostrar o botão. Listas paralelas.

> **Drift entre listas é o bug mais comum.** Quando atualizar uma, leia o checklist da § 12.

---

## 7. Componente `<Can>` — declarativo

```tsx
// src/components/shared/can.tsx (estado atual do repo)
import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions/catalog";
import { useCan, useCanAny } from "@/lib/permissions/use-can";

type CanProps = {
  permission?: Permission;            // permissão única
  anyOf?: readonly Permission[];      // qualquer uma libera
  children: ReactNode;
  fallback?: ReactNode;
};

export function Can({ permission, anyOf, children, fallback = null }: CanProps) {
  const hasSingle = useCan(permission ?? ("__none__" as Permission));
  const hasAny = useCanAny(anyOf ?? []);
  const allowed = permission ? hasSingle : anyOf ? hasAny : false;
  return <>{allowed ? children : fallback}</>;
}
```

> A API real é **`permission`** (única) / **`anyOf`** (array) / `fallback` — **não** `is`/`any`/`all`. Não há variante `all` (use `useCanAll` direto se precisar).

Uso:

```tsx
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ADMIN_PERSONAS } from "@/lib/permissions/persona-groups";

<Can permission={PERMISSIONS.HOSPITALITY.HOTEL_ADMIN}>
  <AdminPanel />
</Can>

<Can anyOf={ADMIN_PERSONAS}>
  <Button>Nova reserva</Button>
</Can>

<Can permission={PERMISSIONS.HOSPITALITY.HOTEL_ADMIN} fallback={<UpgradeBanner />}>
  <BillingPanel />
</Can>
```

---

## 8. Proteção de rotas

Personas por rota — via componente da rota (checagem de **autorização**), enquanto o `beforeLoad: requireAuth` cuida da **autenticação** (ver [`AUTH.md`](./AUTH.md)). Não há layout `_authenticated/`; o guard de auth é por rota.

```tsx
// src/routes/admin/index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCanAny } from "@/lib/permissions/use-can";
import { ADMIN_PERSONAS } from "@/lib/permissions/persona-groups";
import { requireAuth } from "@/lib/router/guards";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/admin/")({
  beforeLoad: requireAuth,        // autenticação
  component: AdminLayout,
});

function AdminLayout() {
  const { isLoading } = useAuth();
  const canAccess = useCanAny(ADMIN_PERSONAS);   // autorização

  if (isLoading) return null;
  if (!canAccess) throw redirect({ to: "/forbidden" });

  return <Outlet />;
}
```

### 8.1 Página `/forbidden`

> ⚠️ **A rota `/forbidden` ainda NÃO existe** neste repo (não há `src/routes/forbidden/`). Ao adotar autorização por rota, crie-a. Exemplo:

```tsx
// src/routes/forbidden/index.tsx  (a criar)
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/forbidden/")({ component: ForbiddenPage });

function ForbiddenPage() {
  const { t } = useTranslation("common");
  return (
    <div className="grid h-screen place-items-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <ShieldOff className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold">{t("forbidden.title")}</h1>
        <Button asChild><Link to="/">{t("forbidden.back")}</Link></Button>
      </div>
    </div>
  );
}
```

---

## 9. Menus e navegação — esconda, não desabilite

```tsx
import { Can } from "@/components/shared/can";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ADMIN_PERSONAS, HOTEL_PERSONAS } from "@/lib/permissions/persona-groups";

<nav>
  <Can anyOf={HOTEL_PERSONAS}>
    <NavLink to="/bookings">{t("nav.bookings")}</NavLink>
  </Can>
  <Can anyOf={ADMIN_PERSONAS}>
    <NavLink to="/users">{t("nav.users")}</NavLink>
  </Can>
  <Can permission={PERMISSIONS.HOSPITALITY.HOTEL_ADMIN}>
    <NavLink to="/admin">{t("nav.admin")}</NavLink>
  </Can>
</nav>
```

Default = esconder. Tooltip "apenas admin" só quando educar é importante.

---

## 10. Tratamento de 403 do backend

403 do backend significa que a persona não foi suficiente, **apesar do front deixar tentar** (drift ou caso edge). O `client.ts` (ver [`AUTH.md` §5](./AUTH.md#5-integração-com-a-api-client-wrapper)) trata:

```ts
if (res.status === 403) {
  const body = await res.json().catch(() => ({}));
  toast.error(t("permissions.forbidden"));
  throw new ApiError(403, body.code ?? "FORBIDDEN", body.message);
}
```

**Não trate 403 como 401.** 401 = sessão expirou → `forceLogout()` → Hub. 403 = autenticado mas sem persona → toast inline.

---

## 11. Testes

### 11.1 Helper de fixture

> ⚠️ O `AuthContext` **não é exportado** de `@/contexts/auth-context` (só `AuthProvider`, `useAuth`, `usePermissions`). O `AuthState` real é `{ user: {id,email,name} | null, permissions: Permission[], isLoading, isAuthenticated }`. Para variar personas no teste, mocke `usePermissions` (ou re-exporte o `AuthContext` e injete um `AuthState`):

```tsx
// test/utils/with-personas.tsx
import { vi } from "vitest";
import type { Permission } from "@/lib/permissions/catalog";

export function mockPersonas(personas: readonly Permission[]) {
  vi.mock("@/contexts/auth-context", async (orig) => ({
    ...(await orig<typeof import("@/contexts/auth-context")>()),
    usePermissions: () => personas,        // Permission[]
  }));
}
```

### 11.2 Teste de componente

```tsx
import { renderWithProviders } from "@/test/utils/render";
import { mockPersonas } from "@/test/utils/with-personas";
import { PERMISSIONS } from "@/lib/permissions/catalog";

test("shows manage button to HOTEL_ADMIN", async () => {
  mockPersonas([PERMISSIONS.HOSPITALITY.HOTEL_ADMIN]);
  renderWithProviders(<BookingActions booking={mockBooking} />);
  expect(await screen.findByRole("button", { name: /cancelar/i })).toBeInTheDocument();
});

test("hides manage button from HOTEL_STAFF", async () => {
  mockPersonas([PERMISSIONS.HOSPITALITY.HOTEL_STAFF]);
  renderWithProviders(<BookingActions booking={mockBooking} />);
  expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
});
```

---

## 12. Checklist — quando mudar personas

Backend é fonte da verdade. Em mudanças coordenadas:

### Adicionando persona nova
1. Backend: adiciona no catálogo + emite no claim `authorities` + deploy staging.
2. Frontend: adiciona o valor no objeto `PERMISSIONS.HOSPITALITY` em `catalog.ts` (o tipo `Permission` e `ALL_PERMISSIONS` se atualizam sozinhos — derivados do objeto).
3. Frontend: adiciona em `persona-groups.ts` onde fizer sentido.
4. Deploy frontend.

### Removendo persona
1. Backend: remove + deploy.
2. Frontend: remove do objeto `PERMISSIONS.HOSPITALITY` → TS aponta usos órfãos.
3. Limpa as listas reutilizáveis.

### Mudando lista de personas autorizadas pra uma feature
1. Backend: ajusta `config.permissions.any` no endpoint.
2. Frontend: ajusta o grupo em `persona-groups.ts` (`ADMIN_PERSONAS`, etc.).
3. Verifica: a lista do front é **igual** à do backend?

> **Defesa contra drift:** quando um endpoint backend muda sua lista, abre PR pareado no front. Idealmente um único PR cross-repo via CodePipeline.

---

## 13. Checklist geral

- [ ] Tipo `Permission` é **definido em `catalog.ts`** (derivado de `PERMISSIONS`), não importado do Kubb
- [ ] Catálogo em `src/lib/permissions/catalog.ts` (`PERMISSION_NAMESPACE`, `AUTHORITIES_KEY`, `ALL_PERMISSIONS`, `isPermission`)
- [ ] `AUTHORITIES_KEY = "authorities"` (claim) e `PERMISSION_NAMESPACE = "HOSPITALITY"` (prefixo removido)
- [ ] `parsePermissionsFromToken` filtra contra o catálogo via `isPermission` (drop silencioso) e devolve `Permission[]`
- [ ] `AuthProvider` (Amplify v6, em `@/contexts/auth-context`) injeta `permissions` (Permission[])
- [ ] Toda verificação passa por `useCan`/`useCanAny`/`useCanAll` ou `<Can permission/anyOf>`
- [ ] **Sempre `PERMISSIONS.HOSPITALITY.XYZ`** — nunca string literal
- [ ] Listas reutilizadas em `persona-groups.ts` (`ADMIN_PERSONAS`, `HOTEL_PERSONAS`, `AGENCY_PERSONAS`, `MANAGE_USERS_PERSONAS`)
- [ ] Autorização por rota redireciona pra `/forbidden` (⚠️ rota ainda não criada) — Hub é só pra auth, não autorização
- [ ] Menus escondem itens (não desabilitam) sem persona
- [ ] 403 vira toast inline (não `forceLogout`)
- [ ] Sem `GET /me/permissions` no front — só `idToken.payload.authorities`
- [ ] Testes cobrem with-persona vs without-persona
- [ ] Se mudou lista de personas no front, verificou que backend reflete o mesmo
