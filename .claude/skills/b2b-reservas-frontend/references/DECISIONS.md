# DECISIONS.md — ADRs do Frontend

> Architecture Decision Records. Cada decisão técnica importante com **contexto**, **opções consideradas**, **decisão**, e **consequências**.

---

## ADR-001 — SPA com Vite + TanStack Router (sem TanStack Start, sem Next.js)

**Status:** Aceito · 2026

### Contexto
Precisamos de uma base React moderna para um app B2B **autenticado** (SEO irrelevante), com foco em DX, type-safety end-to-end e velocidade de dev. O app é servido como bundle estático (S3 + CloudFront / Nginx).

### Opções

1. **Next.js (App Router)** — padrão de mercado, SSR/SSG/ISR, Server Components.
2. **TanStack Start + Vite** — meta-framework com SSR opcional sobre o Router.
3. **Remix** — SSR-first, data loading via loader, mindshare em queda.
4. **Vite + TanStack Router (SPA pura)** — minimalista, sem meta-framework, sem SSR.

### Decisão
**SPA client-side com Vite + TanStack Router.** Sem meta-framework (sem TanStack Start, sem Next).

> Apenas `@tanstack/react-router` está instalado (não há `@tanstack/react-start`). O bootstrap é manual em `main.tsx`/`router.tsx`, a árvore de rotas é gerada em `src/routes.ts` pelo plugin do Router no Vite, e não há SSR.

### Por quê
- **Ecossistema TanStack já era escolha** (Query, Router) — usamos o Router direto, sem a camada extra do Start.
- **SEO/SSR não agregam** num app 100% autenticado; SSR só adicionaria complexidade de runtime e deploy.
- **File-based routing com type-safe params/search** — TanStack Router é o melhor router type-safe em React hoje.
- **Deploy trivial** — bundle estático no S3 + CloudFront, sem servidor Node em produção.
- **Menos magic.** Tudo é JavaScript explícito; sem RSC, sem Server Actions.

### Trade-offs
- **Sem SSR/streaming** — primeira pintura depende do bundle JS (mitigado por code-splitting e budget de bundle, ver [`PERFORMANCE.md`](./PERFORMANCE.md)).
- **Guards de auth são por rota** (`beforeLoad: requireAuth`) em vez de um layout server-side.
- **Comunidade menor** que Next; documentação oficial do Router é boa.

### Quando reconsiderar
- Surgir necessidade de SEO/SSR (landing pages públicas, blog) → avaliar TanStack Start ou Next.
- Tempo de carregamento inicial virar problema apesar do code-splitting → SSR/prerender seletivo.

---

## ADR-002 — Kubb para gerar API client a partir do OpenAPI

**Status:** Aceito · 2026

### Contexto
Backend Fastify expõe OpenAPI completo. Queremos type-safety end-to-end sem manter tipos em paralelo.

### Opções

1. **Kubb** — gera types, Zod schemas, TanStack Query hooks, fetch/axios clients.
2. **openapi-typescript + manual hooks** — só gera types; você escreve hooks à mão.
3. **orval** — similar ao Kubb, ecossistema menor.
4. **tRPC** — type-safe sem OpenAPI, mas exigiria backend tRPC (não temos).
5. **Manual** — sem geração; mantém types à mão.

### Decisão
**Kubb.**

### Por quê
- **Gera hooks TanStack Query prontos.** Sem boilerplate.
- **Mantido ativamente**, comunidade crescente.
- **Configurável** — escolhemos só os plugins que importam.
- **Funciona com qualquer OpenAPI**, não exige biblioteca específica no backend.

### Trade-offs
- **Build extra step.** Adiciona ~10s ao CI.
- **Aprendizado da config.** Plugin system tem learning curve.
- **Quando OpenAPI tá feio, código gerado fica feio.** Disciplina no backend é crítica (operationId, schemas nomeados, tags).

### Quando reconsiderar
- Backend muda para tRPC → adote tRPC client (não mais OpenAPI).
- Kubb estagnar → orval é alternativa direta.

---

## ADR-003 — Zod no frontend (não TypeBox)

**Status:** Aceito · 2026

### Contexto
Backend usa TypeBox (compatível com Fastify, mais rápido). Frontend precisa validar forms e env vars. Há duas linguagens de schema no ecossistema do projeto.

### Opções

1. **Zod no front, TypeBox no back** — cada um onde se encaixa melhor.
2. **TypeBox em ambos** — uma linguagem só.
3. **Zod em ambos** — uniformidade no front, refazer backend.

### Decisão
**Zod no front, TypeBox no back.**

### Por quê
- **Frontend não compartilha schemas com backend de qualquer forma.** Repos separados, Kubb gera tipos a partir do OpenAPI. A linguagem de schema interna de cada um é detalhe de implementação.
- **Zod tem DX superior no front.** `useForm({ resolver: zodResolver(schema) })` é integração canônica. TypeBox + RHF requer adapter custom.
- **Zod tem ecossistema enorme no front.** `@hookform/resolvers/zod`, integrações TanStack, etc.
- **Performance no front é irrelevante.** Validação acontece em form submit (1x) e em env (boot). Não há hot path.
- **Bundle size:** Zod ~12KB gzipped. TypeBox ~3KB. Diferença de ~9KB num bundle de 200KB é ruído.

### Trade-offs
- **Duas linguagens de schema no projeto.** Dev precisa aprender ambas (mas não no mesmo dia).
- **Schemas duplicados em algumas situações.** Mitigado por Kubb gerar Zod do OpenAPI; usamos quando cabe.

### Quando reconsiderar
- Se um dia tivermos shared package entre back e front (monorepo verdadeiro), reavaliar.

---

## ADR-004 — shadcn/ui em vez de Mantine/MUI/Chakra

**Status:** Aceito · 2026

### Contexto
Precisamos de biblioteca de componentes profissional, acessível, customizável.

### Opções

1. **shadcn/ui** — componentes copiados, Radix Primitives + Tailwind.
2. **Mantine** — battery-included, ótima DX, componentes ricos.
3. **MUI (Material UI)** — corporativo, completo, design system Google.
4. **Chakra UI** — focado em DX, customização via theme.
5. **Ark UI / Park UI / outros** — niche.

### Decisão
**shadcn/ui.**

### Por quê
- **Controle total.** Código é seu; sem black box.
- **Bundle: só o que usa.** Sem CSS-in-JS runtime.
- **Acessibilidade real** via Radix Primitives.
- **Padrão de mercado em 2024-2026.** Adoção massiva, dev pool conhece.
- **Theming via CSS variables** — simples, compatível com dark mode trivial.
- **Sem dependência de runtime** que possa quebrar entre versões.

### Trade-offs
- **Mais código no repo.** Cada componente é um arquivo `.tsx` em `components/ui/`.
- **"Updates" exigem re-copiar** ou mergear manualmente.
- **Não tem todos os componentes prontos.** Form/DataTable/DatePicker exigem composição.

### Quando reconsiderar
- App com necessidade de componentes complexos prontos (Mantine tem DataTable rica, calendar, charts).
- Time prefere DX de "instalar e usar" sem mexer em estrutura.

---

## ADR-005 — Playwright em vez de Cypress (e2e)

**Status:** Aceito · 2026

### Contexto
Testes end-to-end em navegador real.

### Opções

1. **Playwright** — Microsoft, multi-browser nativo, traces, debugger visual.
2. **Cypress** — pioneiro, ótima DX inicialmente, mas com limitações conhecidas.
3. **WebDriverIO** — flexível, mas DX inferior.
4. **Puppeteer + custom framework** — só pra Chromium, baixo nível.

### Decisão
**Playwright.**

### Por quê
- **Multi-browser nativo.** Cypress só Chromium-based (suporte parcial a Firefox).
- **API mais robusta.** Auto-wait sem trick, `page.locator` consistente.
- **Traces incríveis** — debugger pós-mortem com timeline, network, console.
- **`codegen`** grava interações e gera código. DX top.
- **Microsoft investe pesado.** Cypress estagnou em features fundamentais.
- **Roda em CI mais rápido.** Paralelização nativa.

### Trade-offs
- **Migrar de Cypress se já tivesse** — não é o caso, projeto novo.
- **Mindshare em transição** — material antigo mais voltado a Cypress, mas Playwright já tem muito conteúdo.

### Quando reconsiderar
- Pouco provável; Playwright é a aposta segura para os próximos 5+ anos.

---

## ADR-006 — React Hook Form em vez de TanStack Form / Formik

**Status:** Aceito · 2026

### Contexto
Library de form para validação tipada, performance, integração com Zod.

### Opções

1. **React Hook Form** — uncontrolled, mature, padrão de mercado.
2. **TanStack Form** — type-safe, novo, mesma família dos outros TanStack libs.
3. **Formik** — clássico, mas em modo manutenção.
4. **Conform** — Remix-first, Server Action friendly.
5. **Native useState + useReducer** — sem lib, controle total.

### Decisão
**React Hook Form + `@hookform/resolvers/zod`.**

### Por quê
- **Padrão de mercado.** Maior comunidade, mais Stack Overflow, mais devs já conhecem.
- **Performance excelente** — uncontrolled, re-render minimal.
- **Integração shadcn `<Form>`** já documentada e padrão.
- **API estável** desde v7. Sem breaking changes desnecessárias.
- **Zod resolver canônico** — `zodResolver(schema)` plug-and-play.

### Trade-offs
- **TanStack Form seria mais consistente** com o resto do stack TanStack. Mas ainda menos maduro; falta integração canônica com shadcn em 2026.
- **Less type-safe than TanStack Form em alguns cantos** — mas com Zod resolver o tipo do `data` no submit já vem perfeito.

### Quando reconsiderar
- TanStack Form atinge maturidade equivalente + integração shadcn oficial.

---

## ADR-007 — S3 + CloudFront via CDK (em vez de Amplify Hosting / Vercel)

**Status:** Aceito · 2026

### Contexto
Hospedar SPA estático em produção.

### Opções

1. **S3 + CloudFront + CDK** — controle total, AWS-nativo.
2. **AWS Amplify Hosting** — magia AWS, CI/CD embutido, mas opaco.
3. **Vercel** — DX top, integra com Next, mas fora da AWS.
4. **Netlify** — similar a Vercel.
5. **Cloudflare Pages** — barato, rápido, fora da AWS.

### Decisão
**S3 + CloudFront via CDK + CodePipeline.**

### Por quê
- **Mesma stack do backend** — toda infra em CDK, mesmo time gerencia.
- **Custo previsível e baixo** (~$15-20/mês para apps médios).
- **Controle total** sobre headers, cache, CSP, behaviors.
- **Sem vendor lock-in de hosting** — code que você escreve não muda se mudar provider.
- **VPC peering / endpoints** se um dia precisarmos (raro em SPA, mas possível).

### Trade-offs
- **Mais código de infra** que Amplify/Vercel (compensa pela consistência com backend).
- **Sem preview deploys automáticos** em PR (configurável, mas trabalho extra).
- **Não tem Edge Functions nativas** como Vercel/Cloudflare (CloudFront Functions limitadas).

### Quando reconsiderar
- App marketing pesado, com necessidade de Edge Functions, A/B testing avançado → Vercel.
- Time muito pequeno, sem capacidade de manter CDK → Amplify Hosting.

---

## ADR-008 — Vitest em vez de Jest

**Status:** Aceito · 2026

### Contexto
Test runner para unit/integração.

### Opções

1. **Vitest** — ESM nativo, mais rápido, compatível com Jest API.
2. **Jest** — padrão clássico, vasta documentação.

### Decisão
**Vitest.** Mesma decisão do backend; consistência.

### Por quê
- **ESM nativo.** Sem fricção de transformers Babel/SWC.
- **Mais rápido** em runs grandes.
- **Compatible com Jest API** — migração trivial.
- **Vite integration** — config compartilhada, plugins reaproveitados.
- **Mesmo runner que o backend** — dev troca de repo sem retreinar.

### Trade-offs
- **Algumas libs assumem Jest globals** — Vitest tem flag para compatibilidade.

### Quando reconsiderar
- Improvável; tendência ESM-only fortalece Vitest.

---

## ADR-009 — Biome em vez de ESLint + Prettier

**Status:** Aceito · 2026

### Contexto
Lint + format.

### Opções

1. **Biome** — Rust, integrado, ~10x rápido.
2. **ESLint + Prettier** — clássico, mais regras.
3. **Oxlint** — Rust, mais novo, focado em lint.

### Decisão
**Biome.** Mesma do backend.

### Por quê
- **Velocidade.** Repos grandes têm impacto real em CI.
- **Config único.** Lint + format + import sorting em um arquivo.
- **Zero JS plugins** para configurar.
- **Estável o suficiente** em 2026 para uso em produção.

### Trade-offs
- **Menos regras** que ESLint (mas as essenciais estão lá).
- **Sem plugins React específicos avançados** (cobertos por TS strict + revisão).

### Quando reconsiderar
- Lint específico (a11y rules muito específicas) → adicione ESLint apenas para isso.

---

## ADR-010 — `localStorage` para refresh token (trade-off documentado)

**Status:** Aceito · 2026

### Contexto
SPAs precisam persistir auth entre reloads. Não há solução perfeita.

### Opções

1. **localStorage** — XSS-vulnerable, mas simples.
2. **sessionStorage** — XSS-vulnerable + perde em refresh de tab.
3. **Memory only** — perde tokens em reload (UX ruim).
4. **HttpOnly cookies** — XSS-safe, mas exige BFF (backend-for-frontend) — não temos.
5. **Encrypted in localStorage** — segurança de fachada (chave também no JS).

### Decisão
**`refresh_token` em `localStorage`, `access_token` apenas em memória.**

### Por quê
- **Refresh em memória inviável** — toda reload faria login novo.
- **Sem BFF na arquitetura** — Cognito direto do client.
- **Access token sai com refresh; comprometer só refresh ainda exige acesso ao Cognito (que tem MFA, IP-based rate limit).**
- **Mitigamos XSS** com CSP rigoroso, React (escape por default), sem `dangerouslySetInnerHTML`, dependências auditadas.

### Trade-offs
- **Aceito risco XSS conhecido.** Para apps de dados muito sensíveis (financeiro, saúde), considerar BFF.

### Quando reconsiderar
- Adoção de BFF (e.g. para outras necessidades como server-side caching) → migra para HttpOnly cookies.
- Ataque XSS real → revisão pode justificar BFF.

---

## ADR-011 — react-i18next em vez de FormatJS / Lingui

**Status:** Aceito · 2026

### Contexto
App começa em pt-BR mas a arquitetura precisa suportar adicionar idiomas sem refatoração. Nenhuma string hardcoded.

### Opções

1. **react-i18next + i18next** — padrão da indústria, vasto ecossistema.
2. **FormatJS (react-intl)** — mantido pela Meta, ICU MessageFormat.
3. **LinguiJS** — moderno, macros, bundle menor.
4. **Tolgee** — SaaS para gerenciar traduções colaborativamente.

### Decisão
**react-i18next.**

### Por quê
- **Maior comunidade.** Mais Stack Overflow, mais devs já conhecem.
- **`<Trans>` é a melhor API** para JSX interpolado.
- **Lazy load por namespace** via `i18next-http-backend` — só carrega o que a rota usa.
- **`zod-i18n-map`** existe e funciona out-of-the-box.
- **Detector de idioma** plug-and-play.

### Trade-offs
- **Mais verboso** que LinguiJS (que usa macros).
- **Bundle maior** que LinguiJS (~25KB vs ~10KB).
- **ICU MessageFormat menos ergonômico** que FormatJS (mas raramente precisamos do ICU pleno).

### Quando reconsiderar
- Time crescer e adoção de macros (LinguiJS) parecer atraente.
- Necessidade de gerenciamento colaborativo de traduções via SaaS (Tolgee).

---

## ADR-012 — Sentry para errors + replay

**Status:** Aceito · 2026

### Contexto
Precisamos saber quando o app quebra em produção, com contexto suficiente para diagnosticar sem reproduzir.

### Opções

1. **Sentry** — padrão de mercado.
2. **CloudWatch RUM** — AWS-nativo.
3. **Datadog RUM** — se já usássemos Datadog APM.
4. **Bugsnag / Rollbar / Honeybadger** — alternativas mais simples.
5. **Self-host GlitchTip** — fork open-source do Sentry.

### Decisão
**Sentry.**

### Por quê
- **Source maps automáticos** via Vite plugin oficial.
- **Session replay** vinculado a erro — vê o que o usuário fez antes do crash.
- **Release tracking** correlaciona regressões a commits específicos.
- **Performance traces** com sampling configurável.
- **Correlation com backend** via tag `trace_id`.
- **DX top** para investigação.

### Trade-offs
- **Custo escala com volume** — apps muito ativos podem estourar plano.
- **Fora da AWS** — mais um vendor.
- **PII em replay exige cuidado** com `maskAllInputs` + classes `.sentry-mask`.

### Quando reconsiderar
- Volume de erros explodir → considere GlitchTip self-hosted ou Sentry self-hosted.
- Time decidir usar Datadog em todo o stack → migrar para Datadog RUM.

---

## ADR-013 — PostHog para product analytics + feature flags

**Status:** Aceito · 2026

### Contexto
Precisamos saber como usuários usam o app, fazer rollout gradual de features, e medir adoção.

### Opções

1. **PostHog** — tudo-em-um (events + flags + replay + surveys).
2. **Mixpanel + LaunchDarkly + Hotjar** — combo "best-of-breed" por categoria.
3. **Amplitude + LaunchDarkly** — analytics forte, sem replay próprio.
4. **GA4 + custom flags** — gratuito mas LGPD chato e DX inferior.
5. **Eventos só no backend** (log via CloudWatch + Athena) — sem SaaS.

### Decisão
**PostHog.**

### Por quê
- **Tudo em um** — eventos + feature flags + replay + funnels + surveys.
- **Custo previsível** — 1M events/mês grátis, depois progressivo.
- **Self-host disponível** se um dia quisermos sair do SaaS.
- **API JS leve** (~50KB gzipped) com tree-shaking.
- **Feature flags com targeting** — rollout por % de usuários, grupos, etc.
- **LGPD-friendly** — opção de não capturar IP, opt-in/opt-out.

### Trade-offs
- **Cada feature isolada** é inferior à melhor da categoria (Mixpanel tem analytics mais sofisticado, LaunchDarkly tem flags mais robustas). Para B2B com < 10k MAUs, PostHog cobre tudo confortavelmente.
- **Session replay sobrepõe com Sentry** — mantemos PostHog replay desligado por default, ligamos via flag quando necessário pra produto.

### Quando reconsiderar
- Volume passar dos limites do plano e custo virar problema.
- Necessidade específica que PostHog não cobre bem (ex: analytics com cohorts muito complexos → Amplitude).

---

## ADR-014 — date-fns + date-fns-tz para manipulação de datas

**Status:** Aceito · 2026

### Contexto
Backend manda strings ISO 8601 em UTC. Frontend precisa exibir no fuso do usuário (que pode ser overridden) e processar input do usuário (datepicker, search params com datas). Operações complexas: comparar dias civis, somar dias úteis, formatar intervalos.

### Opções

1. **`Date` nativo + `Intl.DateTimeFormat`** — zero KB, mais verboso, sem helpers de manipulação.
2. **date-fns + date-fns-tz** — funções puras, ~8KB gzipped no uso típico, imutável.
3. **Day.js + timezone plugin** — 3KB, API estilo Moment.
4. **Luxon** — API rica, classe `DateTime`, ~20KB.
5. **Temporal API + polyfill** — futuro correto, mas Stage 3 em 2026, polyfill ~15KB, ecossistema raso.
6. **Moment.js** — fora de cogitação (deprecated pelo próprio time).

### Decisão
**date-fns + date-fns-tz** para manipulação. **Intl** nativo para formatação locale-aware de números/moeda e `RelativeTimeFormat`.

### Por quê
- **Funções puras nomeadas.** `addDays(date, 3)`, `isSameDay(a, b)`, `differenceInMinutes(end, start)`. Auto-completa, buscável, intuitivo.
- **Imutável.** Toda função retorna novo `Date`; impossível mutar acidentalmente.
- **Tree-shaking real.** Bundle só carrega funções importadas. Uso típico (8-12 funções) fica em ~8KB.
- **TypeScript first-class.** Sem `any`, tipos precisos.
- **date-fns-tz resolve fuso.** `formatInTimeZone(iso, "America/Sao_Paulo", "dd/MM HH:mm")` em uma linha — implementar isso à mão com `Intl` é error-prone (DST, validação de fuso, locale combinado).
- **Adoção alta** (~22M downloads/semana). Mindshare consolidado.

### Trade-offs
- **Mais 2 deps no `package.json`.** Mitigado pelo tree-shaking.
- **API funcional pode ser estranha pra quem vem de Moment/Day.js.** Documentação cobre os padrões em [`DATES.md`](./DATES.md).
- **Não é Temporal.** Quando Temporal estabilizar (2-3 anos), migração será considerada — mas a API de date-fns é próxima o suficiente pra que a refatoração seja mecânica.

### Quando reconsiderar
- Temporal estabiliza com suporte nativo nos browsers principais.
- Bundle de date-fns ficar significativo (mais de 30KB no uso) — improvável com tree-shaking.
- Aparece lib mais leve com mesmo nível de DX e suporte a timezone.

---

## ADR-015 — Modais críticos como rota, modais efêmeros como state local

**Status:** Aceito · 2026

### Contexto
Reservas têm muito "abrir detalhe da reserva X em modal". Duas abordagens convivem em apps React: modal controlado por `useState` vs modal como rota (`/bookings/123` ou `?modal=booking-123`). Ambas funcionam, mas têm trade-offs sérios.

### Opções

1. **Tudo state local** (`useState` no parent): simples, mas:
   - URL não reflete o estado → não é compartilhável.
   - Botão "voltar" do navegador fecha a app inteira.
   - Refresh perde o modal.
   - Deep link impossível.
2. **Tudo rota**: cada modal é `/path/sub/modal`:
   - Cada interação UI vira boilerplate de rota.
   - URLs ficam barulhentas.
   - Modais reusáveis (confirm dialogs) ficam estranhos.
3. **Híbrido (decisão)**: rota para o que importa, state pro que não.

### Decisão
**Modal vira rota quando passa qualquer um destes filtros:**
- Tem URL compartilhável que faz sentido (link de "ver detalhes da reserva 123" enviado por chat).
- Refresh precisa preservar o estado (usuário pode F5 sem perder o que está vendo).
- Conteúdo carrega dados pesados (vale pre-fetch via loader).
- Conteúdo é uma "tela" disfarçada de modal (form complexo, wizard).

**Modal continua sendo state local quando:**
- É efêmero por natureza (confirm dialog "tem certeza?", toast, popover).
- Não tem identidade própria (não há "qual" — só "abrir/fechar").
- Reutilizável e independente de contexto (`<DeleteConfirmDialog>`).

### Implementação — modal como rota

Use search params para sobrepor modal numa rota existente, sem mudar a tela de fundo:

```tsx
// /bookings?modal=booking-detail&id=abc
const searchSchema = z.object({
  modal: z.enum(["booking-detail", "edit-booking"]).optional(),
  id: z.string().uuid().optional(),
});

function BookingsPage() {
  const { modal, id } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <>
      <BookingsList />
      <Dialog
        open={modal === "booking-detail"}
        onOpenChange={(open) => !open && navigate({ search: { modal: undefined, id: undefined } })}
      >
        <DialogContent>{id && <BookingDetail id={id} />}</DialogContent>
      </Dialog>
    </>
  );
}
```

Lista permanece visível atrás; URL é shareable; back button fecha o modal; F5 mantém aberto.

**Para modais que são "telas completas"** (wizard de checkout), prefira **rota dedicada** (`/bookings/$id/edit`), não modal.

### Implementação — modal local

```tsx
const [confirmOpen, setConfirmOpen] = useState(false);

<Button onClick={() => setConfirmOpen(true)}>Excluir</Button>
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Excluir reserva?"
  onConfirm={handleDelete}
/>
```

### Trade-offs
- **Search params poluem URL** se modais aninhados crescem (`?modal=...&editing=...&tab=...`). Mantenha 1 search param de modal por rota.
- **Conflito entre filtros e modal nos search params:** prefixe se necessário (`modalKind=booking-detail`).
- **TypeScript ajuda muito** com `z.enum` listando os modais possíveis — autocomplete e exhaustiveness check.

### Regra prática
Se você ficaria irritado de **perder a tela ao refresh ou ao voltar**, é rota. Se "fechar e abrir de novo" é trivial e esperado, é state.

### Quando reconsiderar
- Apareceram > 5 modais simultâneos numa rota → arquitetura de modal stacks (raro, geralmente sinal de UX errada).
- Time prefere padrão único (mais lockstep, menos pensamento por modal).

---

## Como adicionar nova ADR

1. Próximo número sequencial.
2. Status: `Proposto` → `Aceito` (ou `Rejeitado`/`Substituído`).
3. Contexto: o problema, sem assumir conhecimento.
4. Opções: as **reais** consideradas — não strawmen.
5. Decisão + Por quê: link entre opção escolhida e critérios.
6. Trade-offs: o que você está perdendo.
7. Quando reconsiderar: gatilhos para revisitar.

**ADRs imutáveis.** Mudou a decisão? Crie nova ADR e marque a antiga `Substituído por ADR-XXX`.
