---
name: b2b-form-tests
description: >-
  Escreve testes unitários (Vitest + Testing Library) para componentes de
  formulário do B2B Reservas frontend — passos do wizard de RFP
  (src/components/rfp-form/rfp-form-step-*.tsx), forms com React Hook Form + Zod,
  e qualquer componente que consuma hooks gerados pelo Kubb. Use SEMPRE que a
  tarefa envolver criar/ajustar um arquivo *.spec.tsx de um componente de form,
  testar estados de loading/submit/validação, mockar hooks de query/mutation,
  ou validar acessibilidade (disabled, aria-disabled, aria-busy) de campos.
  Mesmo que o usuário só diga "testa esse componente" ou "cria o spec do passo
  X", se o componente for um form/step, esta skill se aplica.
---

# b2b-form-tests — testes de componentes de formulário

Companheira prática da skill `b2b-reservas-frontend` (cujo `references/TESTING.md`
traz a filosofia geral). Aqui mora o **como** concreto de testar um componente
de formulário neste repo, destilado do spec de referência
`src/components/rfp-form/rfp-form-step-configuration.spec.tsx`.

Antes de escrever, **leia o componente alvo** e identifique: quais hooks Kubb ele
consome, qual namespace i18n usa, se é um passo do wizard (registra submit no
contexto) ou um form autônomo (tem botão de submit próprio), e quais estados ele
renderiza (loading / submit / erro).

---

## 1. Princípio: teste o contrato, não a implementação

Procure elementos por **role e label**, como um usuário (ou leitor de tela)
faria — nunca por classe CSS, `data-slot` (exceto Skeleton, que não tem
semântica) ou estrutura interna. Se você precisa de `getByTestId`, geralmente é
sinal de que a UI está inacessível ou o teste está acoplado demais.

Mapa de roles úteis neste app:

| Elemento | Role | Como buscar |
|---|---|---|
| `<Input>` texto | `textbox` | `getByRole("textbox", { name })` (o `aria-label`/`label` vira o nome) |
| `<Input type="number">` | `spinbutton` | `getByRole("spinbutton", { name })` |
| `<RadioGroupItem>` | `radio` | `getAllByRole("radio")` |
| `<RadioGroup>` | `radiogroup` | — |
| `<fieldset>` | `group` | `getByRole("group")` |
| Skeleton (loading) | nenhum | `container.querySelectorAll('[data-slot="skeleton"]')` |
| Mensagem de erro | nenhum | `findByText("texto traduzido")` |

---

## 2. O que mockar (e o que manter real)

A regra: **mocke a fronteira de rede e o roteamento; mantenha os providers
reais**. Para testes de *contrato de estado* (loading/submit/validação), mockar
os hooks Kubb diretamente é melhor que MSW — você controla `isLoading`,
`isPending`, `isError` de forma síncrona e determinística, e consegue afirmar
`expect(mutate).not.toHaveBeenCalled()` sem depender de timing de rede. (MSW
continua certo para testes de *fluxo de dados ponta-a-ponta*; ver `TESTING.md`.)

**Mocke:**
- `@tanstack/react-router` → `getRouteApi` (devolve `{ useSearch }`) e
  `useNavigate`. Use `importOriginal` e faça spread para não quebrar outros
  exports.
- Cada hook Kubb **pelo caminho completo** que o componente importa
  (`@/api/generated/hooks/<tag>Hooks/useX`), devolvendo o shape que o componente
  desestrutura: query → `{ data, isLoading }`; mutation →
  `{ mutate, isPending, isError }`. Inclua exports auxiliares que o componente
  importe do mesmo módulo (ex.: `getRfpStep1QueryKey`).
- `@/lib/observability/posthog` → `{ posthog: { capture: vi.fn() } }`, para não
  inicializar analytics nos testes.

**Mantenha real:**
- `QueryClientProvider` com um `QueryClient` novo por render (`retry: false`,
  `gcTime: 0`). Assim `useQueryClient()` funciona sem mock.
- Os providers de contexto da feature (ex.: `RfpFormWizardProvider`), com
  valores controláveis (vi.fn). Você quer observar as chamadas, não simular o
  módulo inteiro.
- i18n real (já inicializado no `test/setup.ts`) — asserções veem texto
  traduzido de verdade.

`vi.mock` é içado para o topo do arquivo, então os mocks precisam existir antes
dos imports: crie-os com `vi.hoisted(...)`.

---

## 3. Setup de ambiente (uma vez por necessidade)

**i18n — registre o namespace do componente em `test/setup.ts`.** O setup só
carrega `common`, `zod`, `users`, `rfp`. Se o componente usa `useTranslation("x")`
e `x` não está lá, `t()` devolve a *chave* em vez do texto e as asserções
falham. Adicione o import do JSON e inclua em `ns` e `resources`. É o ponto de
extensão documentado.

**ResizeObserver — polyfill no `beforeAll` do spec** quando o componente usa
primitives Radix que medem layout (RadioGroup, Select, etc.). O JSDOM não provê
e o `react-use-size` quebra sem ele. Copie o bloco do spec de referência.

---

## 4. Harness de render

Crie um `QueryClient` novo por render (cache isolado entre testes) e capture o
handler de submit que o passo registra no contexto do wizard — é o mesmo seam que
o botão "Próximo" do footer usa em produção.

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
```

---

## 5. Como disparar o submit

**Passo do wizard** (sem botão de submit próprio): acione o handler capturado.
Envolva em `act` porque ele dispara validação assíncrona + re-render:

```tsx
async function submitForm(step: ReturnType<typeof renderStep>) {
  const handler = step.submit();
  if (!handler) throw new Error("submit do passo não foi registrado");
  await act(async () => {
    await handler();
  });
}
```

**Form autônomo** (tem o próprio `<button type="submit">`): aja como usuário —
`await user.click(screen.getByRole("button", { name: /salvar/i }))`. Não invente
seam; use o botão real.

---

## 6. O contrato de estado a testar

Estes três estados são o coração de um form neste app. Cubra os que o componente
implementar.

### Loading (pré-carregamento dos dados)
Padrão do repo: inputs viram `Skeleton`; rádios/checkboxes/switches ficam
`disabled` + `aria-disabled`; o `fieldset` inteiro fica `disabled`.

```tsx
useGetRfpStep1Mock.mockReturnValue({ data: undefined, isLoading: true });
renderStep();
expect(screen.getByRole("group")).toBeDisabled();
expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); // virou skeleton
for (const radio of screen.getAllByRole("radio")) {
  expect(radio).toBeDisabled();
  expect(radio).toHaveAttribute("aria-disabled", "true");
}
```

### Validação de obrigatórios (não submeter com dados faltando)
Dispare o submit com o form vazio/parcial e prove que (a) as mensagens
traduzidas aparecem e (b) **nenhuma** mutation foi chamada.

```tsx
await submitForm(renderStep());
expect(await screen.findByText("Informe a descrição da RFP")).toBeInTheDocument();
expect(createMutateMock).not.toHaveBeenCalled();
expect(updateMutateMock).not.toHaveBeenCalled();
```
Inclua o contraponto positivo: preencha tudo, submeta, e afirme
`expect(mutate).toHaveBeenCalledWith({ data: expect.objectContaining({...}) })`
(use `objectContaining` para não acoplar a campos derivados como datas).

### Submetendo (isPending)
Force a mutation a `isPending: true`. O grupo deve ficar `disabled` +
`aria-busy="true"`, todos os campos desabilitados, e o wizard avisado.

```tsx
useCreateRfpMock.mockReturnValue({ mutate: createMutateMock, isPending: true, isError: false });
const { setStepSubmitting } = renderStep();
const group = screen.getByRole("group");
expect(group).toBeDisabled();
expect(group).toHaveAttribute("aria-busy", "true");
expect(screen.getByRole("textbox", { name: "Descrição" })).toBeDisabled();
expect(setStepSubmitting).toHaveBeenCalledWith(true);
```

> Se o componente **ainda não** implementa um desses contratos (ex.: faltava
> `aria-busy`/disabled no submit), confirme com o usuário e implemente a mudança
> mínima no componente antes de testá-la — um teste de comportamento inexistente
> não tem valor. Sinalize a mudança de comportamento claramente.

---

## 7. Higiene entre testes

```tsx
beforeEach(() => {
  vi.clearAllMocks();            // zera histórico de chamadas (mantém implementações)
  useSearchMock.mockReturnValue({ rfpId: undefined });
  useGetRfpStep1Mock.mockReturnValue({ data: undefined, isLoading: false });
  useCreateRfpMock.mockReturnValue({ mutate: createMutateMock, isPending: false, isError: false });
  useUpdateRfpStep1Mock.mockReturnValue({ mutate: updateMutateMock, isPending: false, isError: false });
});
```

Use `describe` aninhado com `beforeEach` próprio para sobrescrever um estado
específico (loading, isPending) só naquele grupo. O `cleanup()` global já roda no
`test/setup.ts`.

---

## 8. Esqueleto completo e gotchas

O arquivo `references/recipes.md` tem os blocos copy-paste (mocks içados, mock do
router, mock dos hooks, harness, helpers) e uma tabela de gotchas (por que `act`,
por que `vi.hoisted`, `importOriginal`, etc.). O exemplo canônico vivo é
`src/components/rfp-form/rfp-form-step-configuration.spec.tsx`.

## 9. Antes de declarar pronto
- `pnpm test:run <arquivo>` passando.
- `pnpm exec biome check <arquivos>` limpo (rode escopado aos seus arquivos — o
  `pnpm check` roda no projeto todo e mostra erros pré-existentes do
  `src/api/generated/**`).
- Sem erros novos de `tsc` nos arquivos que você tocou.
- Casos cobertos: loading · validação (negativo + positivo) · submitting.
