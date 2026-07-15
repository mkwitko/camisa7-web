# recipes.md — blocos copy-paste para specs de form

Referência detalhada da skill `b2b-form-tests`. Todos os trechos vêm do spec
canônico `src/components/rfp-form/rfp-form-step-configuration.spec.tsx` — adapte
nomes de hooks/namespace ao componente que você está testando.

## Índice
1. Imports + polyfill
2. Mocks içados (`vi.hoisted`)
3. Mock do router
4. Mock dos hooks Kubb + posthog
5. Harness de render + helper de submit
6. `beforeEach`
7. Tabela de gotchas

---

## 1. Imports + polyfill ResizeObserver

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix RadioGroupItem mede o indicador via react-use-size (ResizeObserver),
  // ausente no JSDOM. Necessário para qualquer primitive Radix que meça layout.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    } as never;
  }
});
```

## 2. Mocks içados

`vi.mock` é avaliado antes dos imports do módulo, então as funções-mock
referenciadas dentro das factories precisam existir antes — é para isso que serve
`vi.hoisted` (ele roda no topo, junto com os `vi.mock`).

```tsx
const { useSearchMock, navigateMock } = vi.hoisted(() => ({
  useSearchMock: vi.fn(),
  navigateMock: vi.fn(),
}));

const {
  useGetRfpStep1Mock,
  useCreateRfpMock,
  useUpdateRfpStep1Mock,
  createMutateMock,
  updateMutateMock,
  posthogCaptureMock,
} = vi.hoisted(() => ({
  useGetRfpStep1Mock: vi.fn(),
  useCreateRfpMock: vi.fn(),
  useUpdateRfpStep1Mock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  posthogCaptureMock: vi.fn(),
}));
```

## 3. Mock do router

`importOriginal` + spread preserva os demais exports (Link, etc.) caso algum
módulo transitivo os use. `getRouteApi` é chamado no topo do componente, então
precisa devolver um objeto com `useSearch` já no import.

```tsx
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    getRouteApi: () => ({ useSearch: useSearchMock }),
    useNavigate: () => navigateMock,
  };
});
```

## 4. Mock dos hooks Kubb + posthog

Um `vi.mock` por caminho de import. Replique exports auxiliares que o componente
importe do mesmo módulo (aqui, `getRfpStep1QueryKey`).

```tsx
vi.mock("@/api/generated/hooks/rfpHooks/useGetRfpStep1", () => ({
  useGetRfpStep1: useGetRfpStep1Mock,
  getRfpStep1QueryKey: (id: string) => [
    { url: "/rfp/:id/steps/1", params: { id } },
  ],
}));

vi.mock("@/api/generated/hooks/rfpHooks/useCreateRfp", () => ({
  useCreateRfp: useCreateRfpMock,
}));

vi.mock("@/api/generated/hooks/rfpHooks/useUpdateRfpStep1", () => ({
  useUpdateRfpStep1: useUpdateRfpStep1Mock,
}));

vi.mock("@/lib/observability/posthog", () => ({
  posthog: { capture: posthogCaptureMock },
}));

// Componente e contexto importados DEPOIS dos mocks (igual ao spec de location-select).
import { RfpFormStepConfiguration } from "./rfp-form-step-configuration";
import {
  type RfpFormStepSubmit,
  RfpFormWizardProvider,
} from "./rfp-form-wizard-context";
```

## 5. Harness + helper de submit

```tsx
function renderStep() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  let submitStep: RfpFormStepSubmit | null = null;
  const registerStepSubmit = vi.fn((handler: RfpFormStepSubmit | null) => {
    submitStep = handler;
  });
  const goToNextStep = vi.fn();
  const setStepSubmitting = vi.fn();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RfpFormWizardProvider
        value={{ registerStepSubmit, goToNextStep, setStepSubmitting }}
      >
        <RfpFormStepConfiguration />
      </RfpFormWizardProvider>
    </QueryClientProvider>,
  );

  return { ...utils, goToNextStep, setStepSubmitting, submit: () => submitStep };
}

async function submitForm(step: ReturnType<typeof renderStep>) {
  const handler = step.submit();
  if (!handler) {
    throw new Error("o handler de submit do passo não foi registrado");
  }
  await act(async () => {
    await handler();
  });
}
```

## 6. beforeEach

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  useSearchMock.mockReturnValue({ rfpId: undefined });
  useGetRfpStep1Mock.mockReturnValue({ data: undefined, isLoading: false });
  useCreateRfpMock.mockReturnValue({
    mutate: createMutateMock,
    isPending: false,
    isError: false,
  });
  useUpdateRfpStep1Mock.mockReturnValue({
    mutate: updateMutateMock,
    isPending: false,
    isError: false,
  });
});
```

## 7. Tabela de gotchas

| Sintoma / dúvida | Causa | Solução |
|---|---|---|
| `ResizeObserver is not defined` | Radix mede layout via `react-use-size` | Polyfill no `beforeAll` (§1) |
| `t()` devolve a chave (ex.: `form.configuration.title`) em vez do texto | namespace não carregado nos testes | Adicione o namespace em `test/setup.ts` (`ns` + `resources`) |
| Mensagem de erro Zod não aparece traduzida | `FormMessageI18n` chama `t("rfp:...")`; precisa do ns `rfp` | idem acima |
| `vi.fn()` da factory é `undefined` | `vi.mock` é içado acima dos imports | crie os mocks com `vi.hoisted` |
| Warning "not wrapped in act" ao disparar submit | `handleSubmit` é assíncrono + re-render | `await act(async () => { await handler(); })` |
| Mock do router quebra outros exports | factory substitui o módulo inteiro | `importOriginal` + spread (§3) |
| `mutate` aparece chamado em testes que não submeteram | histórico vaza entre testes | `vi.clearAllMocks()` no `beforeEach`, depois re-setar returns |
| Input numérico não vira número no submit | `valueAsNumber`/`onChange` do componente | digite com `userEvent.type(spinbutton, "10")`; afirme `daysUntilOffer: 10` |
| `getByRole("textbox")` não acha o campo no loading | input virou `Skeleton` | no loading use `queryByRole(...).not.toBeInTheDocument()` e busque o skeleton por `data-slot` |
| `toBeDisabled()` no input durante submit | input está dentro de `<fieldset disabled>` | `toBeDisabled()` sobe na árvore e detecta o fieldset — funciona |

> Datas determinísticas: o runner roda com `TZ=UTC`. Se um teste depende de
> "hoje" (ex.: presets de vigência ANNUAL/SEMIANNUAL), prefira
> `expect.objectContaining` nos campos que o usuário digitou e não afirme as
> datas derivadas; ou use `vi.useFakeTimers()` + `vi.setSystemTime()` (ver
> `b2b-reservas-frontend/references/DATES.md`).
