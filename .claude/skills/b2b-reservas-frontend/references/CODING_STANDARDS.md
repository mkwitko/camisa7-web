# CODING_STANDARDS.md — Padrões de Código (Frontend)

> Padrões obrigatórios para todo PR. Lista curta porque o resto é coberto por Biome + tsconfig strict + tipos do Kubb.

---

## 1. TypeScript

### 1.1 `tsconfig.json` base

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "exactOptionalPropertyTypes": true,

    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,

    "noEmit": true,
    "allowImportingTsExtensions": true,

    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.2 Regras de TS

- **Sem `any`.** Use `unknown` + narrowing. Build CI tem rule `no-explicit-any` ativa.
- **`noUncheckedIndexedAccess`** — `array[0]` é `T | undefined`. Trate explicitamente.
- **`useUnknownInCatchVariables`** — `catch (err)` é `unknown`. Use type guards (`if (err instanceof ApiError)`).
- **Sem `as` casual.** Permitido só em:
  - Narrowing após verificação (`obj as Foo` depois de `if ('x' in obj)`).
  - Const assertions (`as const`).
  - DOM types em situações onde não há alternativa (`e.target as HTMLInputElement`).
- **Sem `// @ts-ignore`.** Use `// @ts-expect-error` com comentário do porquê.
- **Tipos vêm do Kubb** para tudo de API. Sem digitar shape de response à mão.

---

## 2. Naming

| Item | Convenção | Exemplo |
|---|---|---|
| Variáveis, funções, props | camelCase | `userId`, `onSubmit` |
| Componentes React | PascalCase | `UserForm`, `DataTable` |
| Tipos, interfaces, enums | PascalCase | `type User`, `enum Role` |
| Constantes globais | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `API_TIMEOUT` |
| Arquivos de componente | kebab-case.tsx | `user-form.tsx` (exporta `UserForm`) |
| Arquivos de hook | kebab-case (prefixo `use-`) | `use-debounce.ts` |
| Arquivos utilitários | kebab-case | `format-date.ts` |
| Pastas | kebab-case | `components/users/`, `hooks/users/` |
| Schemas Zod (variáveis) | camelCase + sufixo `Schema` | `createUserSchema` |
| Tipos derivados de schema | PascalCase | `type CreateUserInput = z.infer<...>` |

**Booleanos com prefixo:**
- `is*`: `isOpen`, `isLoading`, `isAdmin`
- `has*`: `hasAccess`, `hasError`
- `should*`: `shouldRetry`
- `can*`: `canEdit`

**Event handlers:** prefixo `handle*` no nome local, `on*` na prop.

```tsx
function UserForm({ onSubmit }: Props) {
  const handleSubmit = (values: UserInput) => {
    onSubmit(values);
  };
  // ...
}
```

---

## 3. Imports — ordem e estilo

Biome organiza automaticamente. Ordem:

1. `node:*` builtins (raro no front)
2. Dependências externas (`react`, `@tanstack/*`, `zod`)
3. Aliases `@/*` (seu código)
4. Imports relativos `./`, `../`
5. Imports type-only ao final

```tsx
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useCreateUser } from "@/api/generated/hooks/usersHooks/useCreateUser";

import { UserForm } from "./UserForm";

import type { User } from "@/api/generated/types";
```

**Regras:**
- **Sempre `import type`** quando o import é só pra tipo (`verbatimModuleSyntax` força isso).
- **Sem `import *`** exceto em casos justificados (namespace de utils).
- **Sem default imports** de bibliotecas que oferecem named (`import { z } from "zod"`, não `import z from "zod"`).
- Prefira **caminhos absolutos** `@/...` (a partir de 2 níveis de profundidade); relativos só para irmãos diretos.

---

## 4. Componentes React

### 4.1 Estilo

```tsx
// ✅ função declarada (não arrow expression)
export function UserCard({ user }: Props) {
  return <div>{user.name}</div>;
}

// ✅ default export apenas quando exigido (lazy(), pages do TanStack se aplicável)
// Caso contrário, named exports
```

**Por que function declaration:** stack traces, hot reload, e mais fácil de identificar em devtools.

### 4.2 Props

```tsx
// ✅ tipo inline para 1-3 props, type alias para mais
type Props = {
  user: User;
  onEdit?: (id: string) => void;
  className?: string;
};

export function UserCard({ user, onEdit, className }: Props) {
  // ...
}
```

- **Type alias `Props`** (não `interface`). Consistência com tipos do Kubb (que usa `type`).
- **Sem `React.FC`** — obsoleto, não tipa `children` bem.
- **`children` explícito** se aceito: `children: ReactNode`.

### 4.3 Re-export

Cada pasta de feature pode ter `index.ts` re-exportando o que é público. Reduz imports longos.

```ts
// src/components/users/index.ts
export { UserForm } from "./components/UserForm";
export { UsersList } from "./components/UsersList";
// schemas e types ficam internos por default
```

### 4.4 Componente vs hook vs util

- **Componente:** retorna JSX.
- **Hook:** começa com `use*`, usa outros hooks ou retorna stateful logic.
- **Util:** função pura, sem hooks. Em `src/lib/utils/` ou na feature.

---

## 5. Segurança

### 5.1 XSS

- **Nunca `dangerouslySetInnerHTML`** sem sanitização explícita. Se for inescapável, use DOMPurify.
- **React escapa por default** — interpolar texto em JSX é seguro.
- **CSP no CloudFront** já bloqueia inline scripts (veja [`DEPLOYMENT.md`](./DEPLOYMENT.md)).

### 5.2 Tokens e dados sensíveis

- **Access token em memória**, refresh em localStorage (trade-off documentado em [`AUTH.md`](./AUTH.md)).
- **Nunca** logar tokens, senhas, números de cartão. Filtro do logger remove campos sensíveis.
- **Não confie em claims JWT** no client para autorização — só para UX (mostrar nome). Backend é fonte da verdade.

### 5.3 Open redirects

```ts
// ❌ navega para URL externa controlada pelo atacante
navigate({ to: searchParams.redirect });

// ✅ valida que é interna
const redirect = searchParams.redirect;
if (redirect?.startsWith("/") && !redirect.startsWith("//")) {
  navigate({ to: redirect });
}
```

### 5.4 Dependências

- **Lockfile commitado** (`pnpm-lock.yaml`).
- `pnpm audit` no CI falha em high/critical.
- Renovate ou Dependabot semanal.
- Antes de adicionar lib nova, verifique: maintained? > 50k downloads/semana? sem vulnerabilidades?

### 5.5 CSP e headers

Configurados via CloudFront Response Headers Policy (veja [`DEPLOYMENT.md`](./DEPLOYMENT.md)):

- `Content-Security-Policy`: restritivo.
- `Strict-Transport-Security`: HSTS preload.
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 6. Logging

### 6.1 Em dev

`console.log` é OK, mas **remova** antes do PR. Biome pode warningar via `noConsoleLog`.

### 6.2 Em prod

- **Erros JS:** captura via `window.addEventListener("error")` + `unhandledrejection`, envia ao Sentry ou CloudWatch RUM.
- **Eventos de produto:** mande pelo trace correto (Mixpanel, GA4, ou backend).
- **Não logue PII** (e-mails, IDs de usuário em texto livre).

---

## 7. Acessibilidade (a11y) — mínimo obrigatório

- **Todo input tem `<label>` associado** (ou `aria-label` se justificado).
- **Botão de ícone sem texto** tem `aria-label`.
- **Cor não é único significante.** Status erro: cor + ícone + texto.
- **Foco visível** em todos os interativos (Tailwind `focus-visible:ring`).
- **Tab order** lógico (não use `tabIndex` positivos).
- **Imagens decorativas** têm `alt=""`. Imagens significativas têm `alt` descritivo.
- **Headings hierárquicos** (`h1` → `h2` → `h3`; sem pular níveis).
- **Contraste AA**: 4.5:1 texto normal, 3:1 texto grande/UI.

Audit no CI: Lighthouse Accessibility > 95.

---

## 8. Performance — mínimo no PR

- **Sem `useState` redundante para dados da API.**
- **Sem re-renders cascata** evidentes no Profiler.
- **Listas com `key`** estável (ID, não index).
- **Imagens com `width`/`height`** explícitos.
- **Lazy load** para componentes > 50KB.

Targets agressivos e checklist completo em [`PERFORMANCE.md`](./PERFORMANCE.md).

---

## 9. Comentários

- **Evite comentário óbvio.** Código auto-explicativo > comentário.
- **Use JSDoc para utilitários públicos** (`/** ... */`) — editor mostra na hover.
- **`// TODO(jira-id):`** com referência. Sem TODOs órfãos.
- **`// HACK:`** com explicação do porquê e como remover.

---

## 10. Git & PR

### 10.1 Branches

```
main           → produção (protected, requer PR + 1 approval + CI passing)
develop        → staging (protected, mesma regra)
feature/<jira>-<slug>
fix/<jira>-<slug>
chore/<slug>
```

### 10.2 Commits

[Conventional Commits](https://www.conventionalcommits.org):

```
feat(users): add bulk delete action
fix(auth): handle expired refresh token gracefully
chore(deps): bump react-query to 5.x
refactor(forms): extract zod schema to feature
docs: update ARCHITECTURE.md
test(users): add edge cases for list filters
```

### 10.3 PR

- Título: igual a commit conventional (`feat(users): ...`).
- Descrição com **o quê / por quê / como testei**.
- Screenshots para mudanças visuais.
- Link pro Jira/Linear.
- < 400 linhas mudadas idealmente. PRs grandes = quebre.

### 10.4 Hooks de Git

Use `simple-git-hooks` + `lint-staged`:

```json
// package.json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm lint-staged",
    "pre-push": "pnpm typecheck"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["biome check --apply"]
  }
}
```

---

## 11. Definition of Done — checklist do PR

Antes de marcar como pronto para review:

- [ ] **Funcional:** atende ao critério de aceitação do ticket
- [ ] **Tipado:** sem `any`, sem `@ts-ignore`, build limpo (`pnpm typecheck`)
- [ ] **Lint:** `pnpm check` passa sem warnings
- [ ] **Testado:**
  - [ ] Componente novo tem teste de integração (Vitest + TL + MSW)
  - [ ] Mutation crítica tem teste de erro + sucesso
  - [ ] Se for fluxo crítico (login, criar X), tem e2e Playwright
- [ ] **Acessibilidade:** Lighthouse Accessibility > 95, navegação por teclado funciona
- [ ] **Performance:** bundle delta < 50KB gzipped (`pnpm analyze` se feature pesada)
- [ ] **i18n:**
  - [ ] Nenhuma string visível hardcoded (tudo via `t("chave")` ou `<Trans>`)
  - [ ] Chaves novas adicionadas no JSON do namespace certo
  - [ ] Datas/moedas via `useFormat()`, não `.toLocaleDateString()` direto
- [ ] **Datas/timezone:**
  - [ ] Datas formatadas via `useFormat()` (timezone do usuário injetado automaticamente)
  - [ ] Forms enviam `Date.toISOString()` (UTC); recebem strings ISO do backend
  - [ ] Sem `new Date("YYYY-MM-DD")` (interpretado como UTC) — ver [`DATES.md`](./DATES.md) § 7.1
  - [ ] Comparações usam `getTime()` ou `date-fns`, não strings
  - [ ] Testes com data usam `TZ=UTC` + `vi.setSystemTime()`
- [ ] **Permissões (se aplicável):**
  - [ ] Verificações via `useCan(PERMISSIONS.HOSPITALITY.X)` / `<Can>` — **sempre variável do catálogo**, nunca string literal
  - [ ] Catálogo em `src/lib/permissions/catalog.ts` com `as const satisfies Record<string, Record<string, Permission>>`
  - [ ] Personas vêm do tipo `Permission` gerado pelo Kubb (drift detection automático no build)
  - [ ] Padrão persona — nunca cria ações finas (`BOOKING:CREATE` é antipattern; ver ADR-022 do backend)
  - [ ] Listas de personas reutilizadas extraídas para `persona-groups.ts` com `as const satisfies readonly Permission[]`
  - [ ] Rotas restritas redirecionam pra `/forbidden` quando sem persona (não pro HUB_URL — HUB é só auth)
  - [ ] Menus escondem itens (não desabilitam) sem persona
  - [ ] Se mudou lista de personas autorizadas, verificou que backend reflete o mesmo
- [ ] **Uploads (se aplicável):**
  - [ ] Usa `useFileUpload` com `UPLOAD_LIMITS` apropriados
  - [ ] Bucket S3 tem CORS configurado pro domínio
  - [ ] Progress + cancel visíveis para arquivos > 1 MB
  - [ ] `URL.revokeObjectURL` em cleanup de previews
- [ ] **Observabilidade:**
  - [ ] Eventos de produto importantes têm `posthog.capture("event_name", {...})`
  - [ ] Erros de operações críticas têm `Sentry.captureException` com tags relevantes
  - [ ] PII (CPF, cartão, email) marcado com `.sentry-mask` / `.ph-no-capture` se visível
- [ ] **Segurança:**
  - [ ] Sem token logado/exibido
  - [ ] Sem `dangerouslySetInnerHTML` sem sanitize
  - [ ] Inputs validados (Zod no boundary)
- [ ] **UX:**
  - [ ] Loading states (skeleton, não spinner em containers)
  - [ ] Error states (mensagem útil, retry quando aplicável)
  - [ ] Empty states (quando lista vazia)
  - [ ] Toast em mutations
- [ ] **Docs:** se mudou pattern, atualizou o `.md` relevante
- [ ] **Sem TODOs órfãos** sem referência a ticket

---

## 12. Bash e scripts no repo

Se precisar de script (gerar OpenAPI manualmente, fixture seeder), faça em **TypeScript** rodando via `tsx`, não bash. Mais portável, type-safe, debugável.

```ts
// scripts/seed-msw-fixtures.ts
import { writeFile } from "node:fs/promises";
// ...
await writeFile("test/mocks/fixtures.json", JSON.stringify(data, null, 2));
```

```json
{ "scripts": { "seed:fixtures": "tsx scripts/seed-msw-fixtures.ts" } }
```
