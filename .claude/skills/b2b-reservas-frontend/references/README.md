# Docs — Frontend React + Vite + TanStack (B2B Reservas)

Documentação de arquitetura de referência para o frontend dos projetos React da empresa. Companheiro do backend Node+Fastify documentado em `../backend/docs/`.

> **Para começar, leia [`CLAUDE.md`](./CLAUDE.md) primeiro.** É o documento mestre que Claude Code (e qualquer dev) deve ler antes de qualquer task.

---

## Índice

### Visão geral
- [`CLAUDE.md`](./CLAUDE.md) — **Comece aqui.** Pilares, stack, estrutura, como Claude Code deve trabalhar.

### Arquitetura
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Organização por módulo (não vertical slice), file-based routing TanStack, separação de camadas.
- [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) — TypeScript strict, naming, imports, segurança XSS/CSRF, Definition of Done.

### Integração com o backend
- [`KUBB.md`](./KUBB.md) — Geração de types + TanStack Query hooks a partir do OpenAPI do backend Fastify.
- [`AUTH.md`](./AUTH.md) — AWS Amplify v6 + Cognito (híbrido: HUB externo em prod, Authenticator interno em dev), CookieStorage, guards de rota. Sem PKCE manual, sem self-service.

### UI e interação
- [`STYLING.md`](./STYLING.md) — shadcn/ui, Tailwind config, theming, dark mode, acessibilidade.
- [`FORMS.md`](./FORMS.md) — React Hook Form + Zod, integração com schemas Kubb, validação.
- [`STATE.md`](./STATE.md) — TanStack Query (server state) vs Zustand (UI state), patterns, optimistic updates.
- [`I18N.md`](./I18N.md) — react-i18next, namespaces por feature, formatação de números, mensagens Zod.
- [`DATES.md`](./DATES.md) — **leitura obrigatória.** Backend é UTC; frontend converte pro fuso do usuário. Armadilhas, input, testes determinísticos.
- [`UPLOADS.md`](./UPLOADS.md) — Presigned URL do S3, validação client-side, progress, cancel, retry, CORS.
- [`PERMISSIONS.md`](./PERMISSIONS.md) — Permissões padrão **persona** (`HOSPITALITY.HOTEL_ADMIN`, não ação fina). Catálogo local em `src/lib/permissions/catalog.ts` (não do Kubb), `useCan`, `<Can>`, proteção de rotas.

### Infraestrutura
- [`DOCKER.md`](./DOCKER.md) — Dev local com `pnpm dev` (sem Docker, sem proxy), Dockerfile só de produção (Nginx).
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — S3 + CloudFront via AWS CDK, pipeline CodeCommit→CodeBuild→S3, invalidação de cache, env vars no build time.

### Qualidade
- [`TESTING.md`](./TESTING.md) — Vitest + Testing Library (unit/integração), Playwright (e2e), MSW para mockar API.
- [`PERFORMANCE.md`](./PERFORMANCE.md) — Code splitting, lazy loading, bundle analysis, Lighthouse, Core Web Vitals.
- [`OBSERVABILITY.md`](./OBSERVABILITY.md) — Sentry (erros + replay), PostHog (analytics + feature flags), Web Vitals, correlação com traceId do backend.

### Por que essas escolhas?
- [`DECISIONS.md`](./DECISIONS.md) — ADRs (SPA Vite+Router vs Next/Start, shadcn vs Mantine, Zod no front, Playwright vs Cypress, etc).

---

## Stack — resumo

| Camada | Escolha |
|---|---|
| Build/Dev | Vite 5 |
| App shell | SPA client-side (sem meta-framework; sem TanStack Start/Next) |
| Linguagem | TypeScript 5+ strict |
| Router | TanStack Router (file-based, type-safe) |
| Data fetching | TanStack Query 5 |
| API client | Kubb (gera types + hooks do OpenAPI) |
| UI components | shadcn/ui + Tailwind v4 (CSS-first) |
| Auth | AWS Amplify v6 + Cognito (híbrido HUB/Authenticator) |
| Validation | Zod |
| Forms | React Hook Form + `@hookform/resolvers/zod` |
| UI state | Zustand (quando necessário) |
| Datas/timezone | date-fns + date-fns-tz + Intl |
| i18n | react-i18next (pt-BR ativo) |
| Erros + replay | Sentry |
| Product analytics | PostHog |
| Testes unit | Vitest + Testing Library + MSW |
| Testes e2e | Playwright |
| Lint/Format | Biome |
| Package manager | pnpm 9 |
| Deploy | S3 + CloudFront via CDK + CodePipeline |
| Dev local | `pnpm dev` (Vite, sem Docker) |

---

## Performance targets (Core Web Vitals)

| Métrica | Alvo | Limite |
|---|---|---|
| LCP (Largest Contentful Paint) | < 1.5s | 2.5s |
| FID/INP (Interaction to Next Paint) | < 100ms | 200ms |
| CLS (Cumulative Layout Shift) | < 0.05 | 0.1 |
| Bundle inicial (gzipped) | < 200KB | 350KB |
| Time to Interactive | < 2.5s | 4s |
| Lighthouse Performance | > 90 | — |

---

## Fluxo de leitura sugerido

**Se você nunca viu o projeto:**
1. `CLAUDE.md` (~10 min)
2. `ARCHITECTURE.md` (~15 min)
3. `KUBB.md` para entender como consumir a API (~10 min)
4. `DOCKER.md` para subir local (~10 min)

**Se você vai adicionar uma página/feature nova:**
1. `ARCHITECTURE.md` § Anatomia de um módulo + § Checklist
2. `FORMS.md` se a feature tem formulário
3. `STATE.md` se precisa cachear dados ou mutations
4. `DATES.md` se a feature mexe com data/hora (obrigatório se sim)
5. `UPLOADS.md` se a feature recebe arquivos do usuário
6. `PERMISSIONS.md` se a feature tem ações restritas por papel
7. `I18N.md` se vai adicionar texto novo (sempre)
8. `OBSERVABILITY.md` § Eventos de produto (se feature merece tracking)
9. `CODING_STANDARDS.md` § Definition of Done

**Se você está mexendo em estilo/UI:**
1. `STYLING.md`
2. `DECISIONS.md` § ADR shadcn/ui

**Se algo está lento:**
1. `PERFORMANCE.md`
2. Lighthouse local + bundle analyzer

**Se algo está quebrando em produção:**
1. `OBSERVABILITY.md`
2. Sentry: filtre por release / environment / tag `trace_id` para correlacionar com backend

**Se você vai fazer deploy:**
1. `DEPLOYMENT.md`
2. Verifique que env vars de build estão no SSM (incluindo `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`)
