---
name: b2b-reservas-frontend
description: "Use this skill when working on the B2B Reservas frontend — a React 18 + Vite 5 + TanStack (Router + Query) + TypeScript strict SPA consuming the Fastify backend via Kubb-generated types and hooks. Module-based folder structure (components/users/, hooks/users/, schemas/users/), not vertical slice. Triggers: tasks that mention or imply adding/modifying/debugging routes (file-based via TanStack Router, subfolders preferred over dots), components in src/components/<module>/, hooks in src/hooks/<module>/, schemas in src/schemas/<module>/, forms (React Hook Form + Zod with i18n keys as messages), TanStack Query usage with per-module endpoint constants (USERS.ENDPOINT, BOOKINGS.ENDPOINT) for invalidation, uploads (presigned URL flow), persona-based permissions read from idToken authorities claim (HOSPITALITY namespace, values without prefix like 'HOTEL_ADMIN'), AWS Amplify v6 auth (hybrid: prod redirects to external HUB_URL with no internal /login route, dev/local uses an internal @aws-amplify/ui-react Authenticator via isLocalAuth + AuthGate; CUSTOM_WITH_SRP challenge; no self-service signup/forgot/reauth; fetchAuthSession, fetchUserAttributes, CookieStorage, signOut), Tailwind v4 CSS-first (no tailwind.config.ts, @theme in globals.css), shadcn primitives in components/ui/ (kebab-case filenames per shadcn default), dates with date-fns + date-fns-tz (backend is UTC), react-i18next (pt-BR active), Sentry + PostHog, Vitest + Testing Library + Playwright + MSW testing, Docker only for prod (Nginx serving dist/, dev is plain pnpm dev). Activate when the user mentions TanStack Router/Query, useCan, PERMISSIONS.HOSPITALITY.*, USERS.ENDPOINT, formatInTimeZone, Kubb-generated hooks (useMeGetPermissions, useBookingsList), shadcn primitives, AuthProvider, useAuth, AuthGate, isLocalAuth, Authenticator, HUB_URL, forceLogout, FileDropzone, Zod resolver with FormMessageI18n, @theme in CSS, or the B2B Reservas frontend repo by name. Do NOT use this skill for backend (Node.js/Fastify) tasks — that's a separate b2b-reservas-backend skill."
---

# B2B Reservas — Frontend (React + Vite + TanStack)

> **Skill entry point.** Carregue este arquivo antes de qualquer task no repositório frontend. Os `.md` em `./references/` são as referências detalhadas — vá direto para elas quando precisar de profundidade. Cada referência é independente e pode ser lida sob demanda.

---


## 1. Sobre o projeto

Frontend React + Vite consumindo a API Node+Fastify do ambiente **B2B Reservas**. Type-safety **ponta-a-ponta**: schema do backend (TypeBox) → OpenAPI → Kubb gera types e hooks → TanStack Query consome.

**Esta arquitetura serve como referência/padrão para todos os projetos React da empresa.** Decisões aqui devem ser conservadoras, justificadas, e otimizadas para serem **copiadas e adaptadas** por outros times.

**Pilares não-negociáveis** (nessa ordem de prioridade):

1. **Type-safety ponta-a-ponta.** Zero `any` em código de produção. Tipos vêm do OpenAPI, não são escritos à mão.
2. **Performance percebida.** LCP < 1.5s, INP < 100ms. Code splitting agressivo. Bundle inicial < 200KB gzipped.
3. **Acessibilidade.** WCAG AA mínimo. Componentes via Radix (shadcn) já cobrem boa parte.
4. **Observabilidade.** Sentry captura erros, PostHog captura uso. Web Vitals reportados. Sem caixa-preta em produção.
5. **i18n-ready.** Nenhuma string hardcoded. App começa em pt-BR mas a arquitetura suporta novos idiomas sem refatoração.
6. **Testabilidade.** Toda feature crítica tem teste de integração com MSW. Fluxos críticos têm Playwright.
7. **DX e padronização.** Qualquer dev do time entende qualquer página em < 5 min.

> **LCP < 1.5s** = Largest Contentful Paint, principal métrica de "página parece pronta" do Google. Sob 1.5s é "excelente".

---

## 2. Stack (não substitua sem discussão)

| Camada | Escolha | Por quê (curto) |
|---|---|---|
| Build | Vite 5 | Dev server instantâneo via ESM, bundle Rollup em prod |
| App shell | **SPA client-side (sem meta-framework)** | Vite + TanStack Router puro, sem SSR; bundle estático servido por CDN/Nginx. Considerou-se TanStack Start, mas optou-se por SPA estática. |
| Linguagem | TypeScript 5+ strict | Type safety |
| Router | TanStack Router | File-based + type-safe params/search/loader |
| Data fetching | TanStack Query 5 | Padrão de facto para server state em React |
| API client | **Kubb** | Gera types + TanStack Query hooks do OpenAPI do backend |
| UI | shadcn/ui + Tailwind v4 | Componentes copiados (controle total), Radix primitives, **CSS-first config** |
| Auth | **AWS Amplify v6** + Cognito | Padrão da empresa; tokens em CookieStorage; híbrido: prod=HUB externo, dev=Authenticator interno |
| Validação | Zod | Forms, env, validação de boundary |
| Forms | React Hook Form + Zod | Padrão de mercado; mensagens via i18n keys |
| UI state | Zustand (se necessário) | Quando TanStack Query não cobre |
| Datas/timezone | date-fns + date-fns-tz + Intl | UTC do backend → fuso do usuário |
| i18n | react-i18next | pt-BR ativo; estrutura para novos idiomas |
| Erros + replay | Sentry | Source maps, releases, session replay focado em erro |
| Product analytics | PostHog | Eventos, feature flags, funis |
| Testes unit | Vitest + Testing Library + MSW | Mesmo runner do backend |
| Testes e2e | Playwright | Multi-browser, traces, debugging visual |
| Lint/Format | Biome | Mesmo do backend, ~10× ESLint+Prettier |
| Package manager | pnpm 9 | Mesmo do backend |
| Deploy | S3 + CloudFront via CDK | AWS-nativo, mesma stack do backend |

> Por que SPA (sem TanStack Start/Next)? Zod no front? Playwright vs Cypress? Veja [`DECISIONS.md`](./references/DECISIONS.md).

---

## 3. Arquitetura — por módulo, não vertical slice

```
View (rota TanStack)
    ↓
[Page component]  ── orquestra: chama hooks, monta layout, conecta forms
    ↓
[Components do módulo]  ── src/components/<modulo>/* (kebab-case)
    ↓
[Hooks gerados pelo Kubb]  ── useListUsers, useCreateBooking, etc. (nome = operationId)
    ↓
[shadcn/ui primitives]  ── src/components/ui/* (kebab-case)
```

**Princípio:** **organização por tipo + módulo**, não por feature isolada. `components/users/` sempre; `hooks/<módulo>/` e `schemas/<módulo>/` quando o módulo precisa de hooks custom ou de schemas Zod (são criados sob demanda — hoje só existe `hooks/common/`). Cada tipo de coisa num lugar, agrupada por módulo de negócio. Detalhes em [`ARCHITECTURE.md`](./references/ARCHITECTURE.md).

**Diferenças em relação a frameworks tradicionais:**
- **Sem service layer próprio.** Kubb gera os hooks tipados. Não escrevemos `usersService.create()` à mão.
- **Sem state manager global por padrão.** TanStack Query gerencia server state; React state cobre UI state; Zustand só quando há estado UI realmente compartilhado entre rotas.
- **File-based routing.** A estrutura de pastas de `src/routes/` é a estrutura de URLs.
- **Auth híbrida.** Amplify v6 + Cognito. Prod: login externo (HUB_URL), sem `/login` interna. Dev/local: Authenticator interno (`@aws-amplify/ui-react`, lazy). Sem self-service.

Detalhes completos: [`ARCHITECTURE.md`](./references/ARCHITECTURE.md)

---

## 4. Estrutura de pastas

```
src/
├── main.tsx                    # bootstrap React + Amplify + i18n + Router
├── router.tsx                  # createRouter (importa a árvore de ./routes)
├── routes.ts                   # GERADO pelo TanStack Router (@ts-nocheck) — não é routeTree.gen.ts
├── constants.ts                # HUB_URL, etc.
├── env.ts                      # validação Zod das env vars
│
├── routes/                     # file-based routing (subpasta preferida sobre `.`)
│   ├── __root.tsx              # layout raiz (providers + sidebar + <Outlet/>)
│   ├── index.tsx               # /  (beforeLoad faz o guard de auth)
│   └── <módulo>/               # ex.: users/$userId/index.tsx, users/new/index.tsx
│                               # rotas protegidas usam `beforeLoad: requireAuth`
│                               # (não há layout pathless _authenticated/ nem /forbidden)
│
├── api/                        # API CLIENT (Kubb) — fora de lib/
│   ├── client.ts               # fetch wrapper (injeta JWT via Amplify, forceLogout no 401)
│   ├── query-client.ts         # QueryClient singleton
│   ├── modules/                # constantes por módulo (USERS.ENDPOINT, queryKeyRoot)
│   │   ├── index.ts            # barrel
│   │   └── users.ts
│   └── generated/              # GERADO pelo Kubb (gitignored)
│       ├── hooks/<tag>Hooks/   # ex.: usersHooks/, rfpHooks/, undefinedHooks/ (sem tag)
│       ├── types/
│       └── index.ts
│
├── components/                 # COMPONENTES — por módulo (kebab-case files)
│   ├── ui/                     # shadcn (kebab-case por padrão)
│   │   ├── button.tsx
│   │   ├── form.tsx
│   │   └── form-message-i18n.tsx
│   ├── layout/                 # app-sidebar.tsx, app-header.tsx, app-container.tsx
│   ├── shared/                 # auth-gate.tsx, can.tsx, empty-state.tsx, error-state.tsx, image.tsx
│   ├── users/                  # users-list.tsx, user-form.tsx, user-detail.tsx
│   └── bookings/               # booking-card.tsx, bookings-list.tsx
│
├── contexts/                   # React contexts
│   └── auth-context.tsx        # AuthProvider, useAuth, usePermissions
│
├── hooks/                      # HOOKS — só common/ hoje; hooks/<módulo>/ quando precisar
│   └── common/                 # use-debounce.ts, use-format.ts, use-mobile.ts
│
│                               # schemas/<módulo>/ é criado quando um módulo ganha forms Zod
│                               # (ainda não existe — Zod só em env.ts por enquanto)
│
├── lib/                        # INFRA — não-módulo
│   ├── auth/
│   │   ├── amplify.ts             # configureAmplify() + CookieStorage
│   │   ├── local-auth.ts          # isLocalAuth flag (dev/localhost)
│   │   ├── local-authenticator.tsx# UI login interna dev-only (@aws-amplify/ui-react, lazy)
│   │   ├── index.ts               # getJwtToken, getIdTokenPayload, isAuthenticated, forceLogout
│   │   └── test-fixtures.ts       # fixtures pra VITE_ENV=test
│   ├── permissions/
│   │   ├── catalog.ts          # PERMISSIONS.HOSPITALITY.*, AUTHORITIES_KEY
│   │   ├── parse.ts            # parsePermissionsFromToken
│   │   ├── use-can.ts          # useCan, useCanAny, useCanAll
│   │   └── persona-groups.ts   # ADMIN_PERSONAS, HOTEL_PERSONAS, etc.
│   ├── datetime/               # format.ts, parse.ts, timezone.ts
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
    └── globals.css             # Tailwind v4 (@import "tailwindcss" + @theme)

test/
├── e2e/                        # Playwright (testDir; specs criados sob demanda)
├── integration/                # testes de integração (scaffold; ainda vazio)
├── mocks/                      # MSW (handlers.ts, server.ts, browser.ts)
└── setup.ts                    # vitest setup (i18n + MSW server)

public/
├── favicon.ico
└── locales/
    └── pt-BR/
        ├── common.json
        ├── zod.json
        ├── users.json          # namespace por módulo
        └── ...

vite.config.ts                  # plugins: react, tailwindcss, tanstack-router; + config do Vitest (test: {...})
tsconfig.json
biome.json
components.json                 # config shadcn
playwright.config.ts
kubb.config.ts                  # config Kubb (lê fixture local api.json; ver KUBB.md)
api.json                        # OpenAPI fixture commitada (input do Kubb)

docker/
├── Dockerfile                  # SÓ prod (Nginx serve dist/)
└── nginx.conf                  # SPA fallback + cache de assets
                                # Dev é `pnpm dev` direto, sem container

infra/                          # AWS CDK
├── bin/app.ts
└── lib/
    ├── static-site-stack.ts    # S3 + CloudFront
    └── pipeline-stack.ts       # CodePipeline

references/                     # docs detalhados (esta skill)
```

**O client de API mora em `src/api/`** (não `src/lib/api/`) — fora de `lib/` por ser o coração type-safe do projeto.
**Não há `tailwind.config.ts`** — Tailwind v4 é CSS-first ([`STYLING.md`](./references/STYLING.md)).
**Não há `vitest.config.ts`** — a config do Vitest vive em `vite.config.ts`.
**Não há `Dockerfile.dev`** — dev local é `pnpm dev` direto ([`DOCKER.md`](./references/DOCKER.md)).

---

## 5. Como Claude Code deve trabalhar

### Antes de codar

1. **Identifique a camada.** Rota? Componente de feature? Hook? UI primitive? Cada uma tem regras diferentes.
2. **Releia o `.md` relevante.** Integração com API? [`KUBB.md`](./references/KUBB.md). Formulário? [`FORMS.md`](./references/FORMS.md). Estilo? [`STYLING.md`](./references/STYLING.md).
3. **Procure padrão existente.** Se já existe a página `users`, copie a estrutura para `bookings`. Consistência > criatividade.

### Ao escrever código

- **TypeScript strict.** Sem `any`. Sem `as` casual.
- **Tipos vêm do Kubb.** Nunca digite o shape de uma resposta de API à mão.
- **`useQuery`/`useMutation` vêm de hooks gerados** (`useListUsers`, `useGetRfp` — nome = `operationId`), não `useQuery({ queryKey, queryFn })` manual.
- **Invalidação de cache via constantes por módulo:** `queryClient.invalidateQueries({ queryKey: USERS.queryKeyRoot })` — nunca string crua.
- **Filenames em kebab-case.** `user-form.tsx`, `use-cancel-booking.ts`. Export sempre PascalCase (`UserForm`).
- **Rotas: subpasta preferida sobre `.`.** `users/$userId.tsx` em vez de `users.$userId.tsx`. Use `.` só quando subpasta complicaria (raro).
- **Forms via React Hook Form + Zod resolver.** Mensagens são chaves i18n (formato `namespace:caminho`), traduzidas por `<FormMessageI18n />`.
- **Toda string visível usa `t("chave")`.** Sem strings hardcoded ([`I18N.md`](./references/I18N.md)).
- **Datas/moedas/números via `useFormat()`.** Sem `.toLocaleDateString()` ou `Intl.DateTimeFormat` direto em componente ([`DATES.md`](./references/DATES.md)).
- **Backend é UTC.** Strings ISO recebidas terminam com `Z`. Exibir → converter pro fuso do usuário (`useFormat()`). Enviar → `Date.toISOString()`.
- **Auth via AWS Amplify v6 (híbrida).** Não escreva código OAuth/PKCE — Amplify cuida. `useAuth()` do AuthContext expõe `user`, `permissions`, `isLoading`. Logout → `forceLogout()` (vai pro HUB_URL externo). Prod redireciona pro HUB; dev/local usa Authenticator interno (`isLocalAuth` + `AuthGate`). Sem self-service (signup/forgot/reauth). Ver [`AUTH.md`](./references/AUTH.md).
- **Permissões via `useCan(PERMISSIONS.HOSPITALITY.X)`.** Sempre variável do catálogo (`PERMISSIONS.HOSPITALITY.HOTEL_ADMIN`), **nunca** string ad-hoc. Padrão persona — nunca crie ações finas (`BOOKING:CREATE` é antipattern). Ver [`PERMISSIONS.md`](./references/PERMISSIONS.md).
- **Uploads seguem o fluxo de presigned URL do backend** ([`UPLOADS.md`](./references/UPLOADS.md)) — o hook `useFileUpload` ainda não existe neste repo (hoje só há o stub de UI `rfp-form-file-dropzone.tsx`).
- **Sem `<img>` cru** — use componente com `loading="lazy"` e dimensões explícitas (evita CLS).
- **Sem `console.log` em PR.** Use Sentry/PostHog conforme o caso ([`OBSERVABILITY.md`](./references/OBSERVABILITY.md)).
- **Eventos de produto críticos** disparam `posthog.capture("event_name", {...})`.
- **Acessibilidade não é opcional.** `aria-label` em ícones-botão, semântica correta (`<button>` não `<div onClick>`).
- **Cada feature crítica tem teste de integração com MSW.**

### Antes de abrir PR

Checklist em [`CODING_STANDARDS.md`](./references/CODING_STANDARDS.md), seção "Definition of Done".

---

## 6. Comandos essenciais

```bash
# Dev (sem Docker — Vite local)
pnpm dev                     # vite dev server (porta 5173)

# Geração de API client (Kubb)
pnpm api:generate            # kubb generate — lê a fixture local api.json (não baixa do backend)
pnpm api:watch               # kubb generate --watch (regenera ao mudar a spec)

# Build
pnpm build                   # tsc --noEmit && vite build → dist/
pnpm preview                 # serve dist/ local na porta 4173 (testa prod build)

# Testes
pnpm test                    # vitest watch (TZ=UTC)
pnpm test:run                # vitest run (CI)
pnpm test:coverage           # vitest run --coverage (v8)
pnpm test:e2e                # playwright (sobe `pnpm preview` em :4173)
pnpm test:e2e:ui             # playwright UI mode (debugger visual)

# Qualidade
pnpm check                   # biome check .
pnpm check:fix               # biome check --write .
pnpm typecheck               # tsc --noEmit

# Análise
pnpm analyze                 # vite build && vite-bundle-visualizer (bundle size)
pnpm lighthouse              # roda lighthouse contra :4173

# shadcn
pnpm dlx shadcn@latest add button       # adiciona componente (kebab-case)
pnpm dlx shadcn@latest add dialog form
```

> Para apontar o Kubb ao backend real, troque `input.path` em `kubb.config.ts` por uma URL do `openapi.json`. Hoje ele lê a fixture commitada `api.json`.
> **Não há scripts `dev:full`, `deploy:staging` nem `deploy:prod`** — o deploy é feito pelo pipeline CDK (ver [`DEPLOYMENT.md`](./references/DEPLOYMENT.md)).

Detalhes do dev/Docker em [`DOCKER.md`](./references/DOCKER.md) (Docker é só pra prod). Deploy em [`DEPLOYMENT.md`](./references/DEPLOYMENT.md).

---

## 7. Quando estiver em dúvida

1. Olhe um módulo existente como referência (`components/users/` é o template canônico).
2. Releia o `.md` da área.
3. Pergunte: "isso preserva os 5 pilares da seção 1?"
4. Se ainda em dúvida, prefira **menos código** + **mais type-safety**, nessa ordem.
5. **Não invente padrões novos sozinho.** Esta é arquitetura corporativa; consistência entre projetos importa mais que otimização local.
