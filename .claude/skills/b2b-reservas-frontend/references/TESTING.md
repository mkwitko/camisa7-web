# TESTING.md — Vitest + Testing Library + Playwright + MSW

> Filosofia: **teste como o usuário usa**. Procure elementos por texto, label e role — não por classe CSS ou ID. Refatorar implementação sem quebrar testes deve ser regra, não exceção.

---

## 1. Pirâmide

```
        /\
       /e2e\         poucos (~10-20)    — Playwright, fluxos críticos
      /------\
     /integr. \      vários (~30-80)    — Vitest + TL + MSW
    /----------\
   /   unit     \    muitos (~centenas) — Vitest + TL (componentes isolados)
  /--------------\
```

**Para frontend, "unit" e "integração" se misturam.** Não tenha medo: a maioria dos seus testes são **de componente com MSW mockando API** (técnicamente "integração"). Está certo. É o sweet spot.

---

## 2. Por que essa stack (recap)

- **Vitest** — runner. Mesmo do backend. Rápido, ESM nativo, DX excelente.
- **Testing Library** (`@testing-library/react` + `@testing-library/user-event`) — abordagem "teste como usuário". Padrão da indústria.
- **MSW** (Mock Service Worker) — intercepta `fetch`/`XHR` no nível do **service worker** (ou Node em testes). Você não mocka módulos; mocka a **rede**.
- **Playwright** — e2e em navegador real (Chromium, Firefox, WebKit). Para validar fluxos completos.

Detalhes da decisão em [`DECISIONS.md`](./DECISIONS.md).

---

## 3. Setup

### 3.1 Instalar

```bash
pnpm add -D vitest @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  msw \
  @playwright/test
```

### 3.2 Config do Vitest — dentro do `vite.config.ts`

**Não há `vitest.config.ts` separado.** A config de testes vive no bloco `test:` do `vite.config.ts` (reaproveita os plugins do app):

```ts
// vite.config.ts (trecho)
/// <reference types="vitest/config" />
export default defineConfig({
  plugins: [tanstackRouter({ /* ... */ }), react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",          // colocados (o repo usa .spec)
      "test/integration/**/*.{test,spec}.{ts,tsx}",
    ],
    css: true,
    coverage: {
      provider: "v8",
      exclude: ["**/*.gen.ts", "src/lib/api/generated/**", "infra/**", "test/**"],
    },
  },
});
```

> `globals: true` (sem importar `describe`/`test`), `css: true`. **Sem thresholds de cobertura configurados** ainda. O exclude `src/lib/api/generated/**` está **desatualizado** — o código gerado mora em `src/api/generated/` (ajuste ao mexer no config). Os specs do repo são **`.spec.tsx` colocados** ao lado do código (ex.: `src/components/ui/date-picker.spec.tsx`).

### 3.3 Setup global

```ts
// test/setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterAll, afterEach, beforeAll } from "vitest";
import common from "../public/locales/pt-BR/common.json";
import users from "../public/locales/pt-BR/users.json";
import zod from "../public/locales/pt-BR/zod.json";
import { server } from "./mocks/server";

// i18n REAL e síncrono com recursos embutidos (sem HTTP backend nos testes).
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "pt-BR",
    fallbackLng: "pt-BR",
    ns: ["common", "zod", "users"],
    defaultNS: "common",
    resources: { "pt-BR": { common, zod, users } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
```

> O setup inicializa o **i18n real** (não um mock) com os JSONs de `pt-BR` embutidos — asserts veem o texto traduzido de verdade. Para adicionar um namespace ao ambiente de teste, importe o JSON e inclua em `ns`/`resources`.

> **Datas em testes:** force `TZ=UTC` no `package.json` (`"test": "TZ=UTC vitest"`) e use `vi.useFakeTimers()` + `vi.setSystemTime()` para "agora" determinístico. Detalhes em [`DATES.md`](./DATES.md#8-testes--como-evitar-testes-flakey).

### 3.4 MSW server (Node, para Vitest)

```ts
// test/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

```ts
// test/mocks/handlers.ts
import { http, HttpResponse } from "msw";
import { env } from "@/env";

const api = (path: string) => `${env.VITE_API_BASE_URL}${path}`;

export const handlers = [
  http.get(api("/users"), () => {        // paths sem prefixo /v1 (espelham os do client)
    return HttpResponse.json({
      items: [
        { id: "u1", email: "alice@b.com", name: "Alice", role: "user" },
        { id: "u2", email: "bob@b.com", name: "Bob", role: "admin" },
      ],
      page: 1,
      totalPages: 1,
    });
  }),
  http.post(api("/users"), async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string };
    return HttpResponse.json(
      { id: "new-id", ...body, role: "user" },
      { status: 201 },
    );
  }),
];
```

### 3.5 Browser MSW (opcional, para `pnpm dev` com API offline)

```bash
pnpm dlx msw init public/ --save
```

```ts
// src/main.tsx (trecho)
if (import.meta.env.VITE_MSW_ENABLED === "true") {
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "warn" });
}
```

Útil para desenvolvimento offline ou demos. **Nunca em produção.**

---

## 4. Padrões de teste

### 4.1 Teste de componente isolado

```tsx
// src/components/ui/button.test.tsx
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Button } from "./button";

test("renders with children", () => {
  render(<Button>Click me</Button>);
  expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
});

test("calls onClick", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Save</Button>);
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(onClick).toHaveBeenCalledOnce();
});

test("respects disabled", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick} disabled>Save</Button>);
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(onClick).not.toHaveBeenCalled();
});
```

### 4.2 Teste de componente que consome hook do Kubb

Crie um wrapper de teste que provê QueryClient + Router. **Aqui criamos um QueryClient novo por teste de propósito** — em produção há um único global (ver [`STATE.md`](./STATE.md#21-setup-do-queryclient--singleton-global)), mas testes precisam de:

- Cache vazio entre testes (evita vazamento de estado de um teste para outro).
- `retry: false` (não esperar retries; falhas devem ser determinísticas).
- `gcTime: 0` (limpa imediatamente após desmontagem).

```tsx
// test/utils/render.tsx
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter, createRootRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

type Options = RenderOptions & {
  initialPath?: string;
  queryClient?: QueryClient; // permite override caso teste precise de config específica
};

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const queryClient = opts.queryClient ?? new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
    // Silencia logs de erro esperados em testes
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });

  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [opts.initialPath ?? "/"] }),
    context: { queryClient },
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
      opts,
    ),
    queryClient, // expõe para testes que precisam invalidar/setQueryData manualmente
  };
}
```

```tsx
// src/components/users/users-list.test.tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils/render";
import { UsersList } from "./UsersList";

test("renders list of users", async () => {
  renderWithProviders(<UsersList filters={{ page: 1 }} />);
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Bob")).toBeInTheDocument();
});

test("shows skeleton while loading", () => {
  renderWithProviders(<UsersList filters={{ page: 1 }} />);
  expect(screen.getByTestId("users-skeleton")).toBeInTheDocument();
});
```

### 4.3 Teste de form

```tsx
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils/render";
import { UserForm } from "./UserForm";

test("validates required fields", async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<UserForm onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole("button", { name: /salvar/i }));
  expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("submits valid form", async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<UserForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText(/nome/i), "Alice");
  await userEvent.type(screen.getByLabelText(/e-mail/i), "alice@test.com");
  await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alice", email: "alice@test.com" }),
    );
  });
});
```

### 4.4 Override de handler MSW em teste específico

```tsx
import { server } from "@/test/mocks/server";
import { http, HttpResponse } from "msw";

test("shows error on 500", async () => {
  server.use(
    http.get("*/users", () => HttpResponse.json(
      { error: { code: "INTERNAL", message: "boom" } },
      { status: 500 },
    )),
  );

  renderWithProviders(<UsersList filters={{ page: 1 }} />);
  expect(await screen.findByText(/erro ao carregar/i)).toBeInTheDocument();
});
```

---

## 5. Queries do Testing Library — qual usar quando

Em ordem de preferência (do mais "como usuário" para o mais "implementação"):

| Query | Quando usar |
|---|---|
| `getByRole` | **Default.** `button`, `link`, `textbox`, `heading`, `dialog`, `combobox` |
| `getByLabelText` | Form fields |
| `getByPlaceholderText` | Quando não há label (raro, evite) |
| `getByText` | Texto visível na tela |
| `getByDisplayValue` | Inputs com valor |
| `getByAltText` | `<img>` |
| `getByTitle` | Elementos com `title` |
| `getByTestId` | **Último recurso.** Componentes sem semântica acessível. |

**Variantes:**
- `getBy*` — assertion síncrona, falha se não encontra
- `queryBy*` — retorna null se não encontra (para asserções de ausência)
- `findBy*` — async, espera aparecer (use com `await`, para dados que carregam)
- `*all*` (`getAllByRole`) — múltiplos elementos

```tsx
// ✅
screen.getByRole("button", { name: /salvar/i })
screen.findByText("Usuário criado")
expect(screen.queryByText("Loading")).not.toBeInTheDocument()

// ❌ frágil; quebra ao refatorar HTML
container.querySelector(".btn-primary")
```

---

## 6. userEvent vs fireEvent

**Sempre `userEvent`.** Simula interação humana (foco, keyboard, click composto). `fireEvent` dispara eventos crus — raramente o que você quer.

```ts
import { userEvent } from "@testing-library/user-event";

await userEvent.type(input, "Hello");      // dispara keydown+input+keyup por char
await userEvent.click(button);             // foca, mousedown, mouseup, click
await userEvent.tab();                     // foco no próximo
await userEvent.selectOptions(select, "br");
await userEvent.upload(fileInput, new File(["..."], "f.txt"));
```

---

## 7. Acessibilidade nos testes

Se você consegue testar via `getByRole`, seu app é acessível por screen reader. Se você se viu usando `getByTestId` muito, **isso é sinal** de que a UI pode estar inacessível.

**Bonus:** rode `axe` em alguns testes-chave:

```tsx
import { axe } from "vitest-axe";
import "vitest-axe/extend-expect";

test("UserForm has no a11y violations", async () => {
  const { container } = renderWithProviders(<UserForm onSubmit={() => {}} />);
  expect(await axe(container)).toHaveNoViolations();
});
```

---

## 8. Cobertura

Cobertura via `v8` (`pnpm test:coverage`). **Ainda não há thresholds configurados** no `vite.config.ts` — a meta de equipe é ~75% lines / 70% branches, mas não é enforçado pelo runner hoje.

Excluído (do bloco `coverage.exclude`):
- `**/*.gen.ts` (gerado)
- `src/lib/api/generated/**` — ⚠️ caminho **desatualizado**; o gerado está em `src/api/generated/`
- `infra/**`
- `test/**`

**Não persiga 100%.** 80% bem feito > 100% com testes inúteis.

---

## 9. Playwright para e2e

### 9.1 Setup

```ts
// playwright.config.ts (estado atual do repo)
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  use: {
    baseURL: "http://localhost:4173",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
```

> Config mínima hoje: **só Chromium**, `baseURL` na porta do `preview` (`4173`), sem `retries`/`fullyParallel`/multi-browser. Adicione projetos (Firefox, mobile) e `retries` em CI quando a suíte e2e crescer.

> **`test/e2e/` e `test/integration/` estão referenciados na config mas ainda vazios** — não há specs e2e nem de integração no repo. Os testes existentes são unit/componente colocados (`*.spec.tsx`). Ao adicionar o primeiro e2e, crie `test/e2e/<fluxo>.spec.ts`.

### 9.2 Estrutura de teste

```ts
// test/e2e/users.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Users page", () => {
  // Auth: rode o app com VITE_ENV=test (fixtures) ou reuse storageState (§9.4).
  // Não há token em localStorage — Amplify guarda em cookies.

  test("creates a user", async ({ page }) => {
    await page.goto("/users");
    await page.getByRole("link", { name: /novo usuário/i }).click();

    await page.getByLabel("Nome").fill("Alice");
    await page.getByLabel("E-mail").fill("alice@test.com");
    await page.getByLabel("Papel").click();
    await page.getByRole("option", { name: "Usuário" }).click();
    await page.getByRole("button", { name: /salvar/i }).click();

    await expect(page).toHaveURL("/users");
    await expect(page.getByText("Alice")).toBeVisible();
  });
});
```

**Filosofia idêntica ao Testing Library:** `getByRole`, `getByLabel`, `getByText`. Habilidades transferíveis.

### 9.3 O que cobrir em e2e

**Sim:**
- Login + redirect Cognito (use staging real)
- Fluxo "criar X" do início ao fim
- Navegação entre rotas críticas
- Refresh em página com estado (filtros mantidos)
- Logout

**Não:**
- Validação de cada campo de form (cobre em Vitest)
- Cada combinação de filtros
- Comportamento em erro 500 de cada endpoint

**Regra:** 10-15 testes e2e focados em **fluxos**, não em **detalhes**.

### 9.4 Auth em e2e

Duas estratégias:

**A) Login real via Cognito staging:**
```ts
// test/e2e/auth.setup.ts
import { test as setup } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  // Cognito Hosted UI
  await page.getByLabel("Username").fill(process.env.E2E_USERNAME!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
  await page.context().storageState({ path: "test/e2e/.auth/user.json" });
});
```

Reaproveite o state nos demais testes:
```ts
test.use({ storageState: "test/e2e/.auth/user.json" });
```

**B) Bypass com `VITE_ENV=test`** (rápido, mas menos realista):
Build/serve o app com `VITE_ENV=test` — o `AuthProvider` injeta `TEST_AUTH` e `isAuthenticated()`/`getJwtToken()` retornam fixtures (ver [`AUTH.md` §9](./AUTH.md#9-test-mode-e2e-e-local-sem-hub)). Não existe flag `VITE_AUTH_DEV_BYPASS` nem rota `/login` interna.

### 9.5 Comandos

```bash
pnpm test:e2e               # playwright (sobe `pnpm preview` em :4173)
pnpm test:e2e:ui            # UI mode (passo-a-passo, debugger visual)
pnpm exec playwright codegen http://localhost:4173  # gera testes gravando interação
```

> Só existem `test:e2e` e `test:e2e:ui` no `package.json` (não há `test:e2e:debug`).

---

## 10. CI

```
Stage 1 (paralelo, ~3 min):
  - biome check
  - typecheck
  - vitest run (com coverage)

Stage 2 (~5-8 min):
  - playwright (apenas chromium em PR; full matrix em main)
```

Em PR, falha em Stage 1 bloqueia merge. Stage 2 bloqueia se falhar.

---

## 11. Testes para evitar

- **Snapshot tests** — gigantes, frágeis, ninguém lê. Use só para outputs estáveis (markdown gerado, etc).
- **Tests de implementação** — "chamou `setState` 3 vezes". Quebra ao refatorar.
- **Testes de bibliotecas** — não teste que React renderiza. Teste seu código.

---

## 12. Padrões anti-flake

1. **Sempre `await userEvent.*`** — todas as interações são async no v14+.
2. **`findBy` para dados async**, não `getBy` com `setTimeout`.
3. **`waitFor` raramente** — só quando não há um element appearing/disappearing claro.
4. **MSW handler retorna determinístico** — sem `Math.random`.
5. **Sem `setTimeout` em testes** — substitua por waiting expressivo do TL/Playwright.
6. **Limpe state entre testes** — `cleanup()`, `server.resetHandlers()`, `localStorage.clear()` se aplicável.

---

## 13. Checklist de testes

- [ ] Componente novo tem teste em mesma pasta
- [ ] Usa `renderWithProviders` se consome hooks
- [ ] MSW handler em `test/mocks/handlers.ts`
- [ ] Queries via `getByRole` / `getByLabelText` (não `testId` se possível)
- [ ] `userEvent`, não `fireEvent`
- [ ] Casos: happy path, validação, erro de API
- [ ] Sem `act()` manual (TL cuida)
- [ ] Sem `waitFor` arbitrário; use `findBy`
- [ ] E2e cobre apenas fluxos críticos (não cada validação)
