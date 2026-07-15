# OBSERVABILITY.md — Observabilidade no Frontend

> Saber **o que** quebrou (Sentry), **quem** usou (PostHog), e **como performou** (Web Vitals). Três camadas independentes; cada uma com seu papel.

---

## 1. Stack e divisão de responsabilidades

| Ferramenta | Responsabilidade | Por quê escolhida |
|---|---|---|
| **Sentry** | Erros JS, traces de performance, release tracking, source maps, session replay focado em erros | Padrão de mercado para error tracking; integra com source maps; correlação com backend via traceId |
| **PostHog** | Product analytics (eventos), feature flags, session replay focado em produto, surveys | Tudo-em-um para analytics; self-host possível; alternativa a Mixpanel + LaunchDarkly + Hotjar |
| **`web-vitals` lib** | Core Web Vitals (LCP, INP, CLS) enviados a Sentry/PostHog | Lib oficial do Google, ~1KB |

### 1.1 Session replay: Sentry **ou** PostHog?

**Ambos oferecem.** Sobreposição real.

| Cenário | Use |
|---|---|
| "Por que esse usuário viu erro X?" | Sentry — replay já está vinculado ao erro |
| "Como usuários estão usando feature Y?" | PostHog — replay vinculado a evento/funil |
| "Em qual versão começou a regredir?" | Sentry — release tracking |
| "Quem usa o feature?" | PostHog — analytics |

**Decisão:** habilite replay no **Sentry** (sampling baixo, ex. 10% das sessões; 100% em sessões com erro). PostHog session replay **desligado por padrão**; ligamos se identificarmos necessidade de produto específica. Evita duplo custo de replay + dois lugares pra olhar.

---

## 2. Sentry — setup

### 2.1 Instalar

```bash
pnpm add @sentry/react @sentry/vite-plugin
```

### 2.2 Init

```ts
// src/lib/observability/sentry.ts
import * as Sentry from "@sentry/react";
import { env } from "@/env";

export function initSentry() {
  if (!env.VITE_SENTRY_DSN || env.VITE_ENV === "development") return;

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_ENV,                    // staging | production
    release: env.VITE_APP_VERSION,                // injetada no build (git SHA)

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        maskAllInputs: true,                       // mascara inputs (senhas, CPF, etc)
        blockAllMedia: false,
        networkDetailAllowUrls: [
          env.VITE_API_BASE_URL,                  // captura headers/body apenas da nossa API
        ],
      }),
    ],

    // Performance
    tracesSampleRate: env.VITE_ENV === "production" ? 0.1 : 1.0,
    tracePropagationTargets: [
      /^https:\/\/api\.(staging\.)?b2b-reservas\.com/,
    ],

    // Replay
    replaysSessionSampleRate: 0.1,                 // 10% das sessões "normais"
    replaysOnErrorSampleRate: 1.0,                 // 100% quando dá erro

    // Filtros — NÃO mande pro Sentry
    ignoreErrors: [
      // Erros benignos do browser
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Extensões de navegador
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    denyUrls: [
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],

    beforeSend(event, hint) {
      // Não envia erros de rede que são esperados (4xx do nosso backend)
      const error = hint.originalException;
      if (error && typeof error === "object" && "status" in error) {
        const status = (error as { status: number }).status;
        if (status >= 400 && status < 500 && status !== 401) {
          return null;
        }
      }
      return event;
    },
  });
}

export { Sentry };
```

### 2.3 Bootstrap

```tsx
// src/main.tsx
import { initSentry } from "@/lib/observability/sentry";

initSentry();                              // antes do React mount

// ... resto
```

### 2.4 Error Boundary

```tsx
// src/components/SentryErrorBoundary.tsx
import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="grid h-screen place-items-center p-8">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Algo deu errado</h1>
            <p className="text-muted-foreground">
              Nossa equipe foi notificada. Tente recarregar a página.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={resetError}>Tentar novamente</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Recarregar
              </Button>
            </div>
            {import.meta.env.DEV && (
              <pre className="mt-6 text-xs text-left text-destructive">{String(error)}</pre>
            )}
          </div>
        </div>
      )}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
```

```tsx
// src/App.tsx
<AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
</AppErrorBoundary>
```

### 2.5 Identificar usuário após login

```ts
// src/lib/observability/identify.ts
import * as Sentry from "@sentry/react";
import { posthog } from "./posthog";

export function identifyUser(user: { id: string; email: string; role?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,                       // mascarado por padrão se preocupar com PII
    // ...evite mandar dados sensíveis
  });
  posthog.identify(user.id, {
    email: user.email,
    role: user.role,
  });
}

export function clearUserIdentity() {
  Sentry.setUser(null);
  posthog.reset();
}
```

Chame `identifyUser` no callback de login bem-sucedido. `clearUserIdentity` no logout.

### 2.6 Capturar erro manualmente

```ts
import * as Sentry from "@sentry/react";

try {
  await complexOperation();
} catch (err) {
  Sentry.captureException(err, {
    tags: { feature: "users", action: "bulk-delete" },
    extra: { itemCount: items.length },
  });
  throw err; // ou trate como precisar
}
```

### 2.7 Breadcrumbs custom

Sentry já captura cliques, navigation, fetch automaticamente. Adicione breadcrumbs explícitos em eventos importantes:

```ts
Sentry.addBreadcrumb({
  category: "feature",
  message: "User clicked bulk delete",
  level: "info",
  data: { itemCount: 5 },
});
```

### 2.8 Plugin Vite para source maps

```ts
// vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    TanStackRouterVite(),
    // Sentry plugin: faz upload de sourcemaps automaticamente no build
    process.env.SENTRY_AUTH_TOKEN && sentryVitePlugin({
      org: "b2b-reservas",
      project: "frontend",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],   // não serve sourcemap publicamente
      },
    }),
  ].filter(Boolean),
  build: {
    sourcemap: true,                          // necessário para upload (depois é deletado)
  },
});
```

`SENTRY_AUTH_TOKEN` no CodeBuild via SSM. Token de release upload, scope mínimo.

---

## 3. PostHog — setup

### 3.1 Instalar

```bash
pnpm add posthog-js
```

### 3.2 Init

```ts
// src/lib/observability/posthog.ts
import posthog from "posthog-js";
import { env } from "@/env";

export function initPostHog() {
  if (!env.VITE_POSTHOG_KEY || env.VITE_ENV === "development") return;

  posthog.init(env.VITE_POSTHOG_KEY, {
    api_host: env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",       // só perfis pra usuários autenticados
    capture_pageview: false,                   // controlamos manualmente (TanStack Router)
    capture_pageleave: true,
    autocapture: {
      // captura clicks em botões/links automaticamente
      dom_event_allowlist: ["click", "submit"],
      element_allowlist: ["button", "a", "input", "form"],
    },
    session_recording: {
      maskAllInputs: true,
    },
    disable_session_recording: true,           // ligamos via feature flag se precisar
    loaded: (ph) => {
      if (env.VITE_ENV !== "production") ph.opt_in_capturing();
    },
  });
}

export { posthog };
```

### 3.3 Tracking de pageview com TanStack Router

```ts
// src/lib/observability/page-tracking.ts
import { posthog } from "./posthog";
import { router } from "@/router";

export function setupPageTracking() {
  router.subscribe("onResolved", ({ toLocation }) => {
    posthog.capture("$pageview", {
      $current_url: window.location.href,
      path: toLocation.pathname,
      search: toLocation.search,
    });
  });
}
```

```tsx
// src/main.tsx (trecho)
initPostHog();
setupPageTracking();
```

### 3.4 Eventos de produto

```ts
import { posthog } from "@/lib/observability/posthog";

// Em UserForm.tsx
posthog.capture("user_created", {
  user_role: data.role,
  has_bio: !!data.bio,
});
```

**Convenções de nome:**
- snake_case
- verbo no passado: `user_created`, `booking_canceled`, `report_exported`
- propriedades em snake_case também

### 3.5 Feature flags

```tsx
// src/hooks/use-feature-flag.ts
import { useEffect, useState } from "react";
import { posthog } from "@/lib/observability/posthog";

export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState(() => posthog.isFeatureEnabled(flag) ?? false);

  useEffect(() => {
    const handler = () => setEnabled(posthog.isFeatureEnabled(flag) ?? false);
    posthog.onFeatureFlags(handler);
    return () => {
      // posthog não expõe off explicitamente; gera uma vez no mount basta
    };
  }, [flag]);

  return enabled;
}
```

```tsx
const showNewDashboard = useFeatureFlag("new-dashboard");
return showNewDashboard ? <NewDashboard /> : <OldDashboard />;
```

### 3.6 PostHog + Sentry — correlação

Adicione o `distinct_id` do PostHog como tag no Sentry:

```ts
import { posthog } from "./posthog";
import * as Sentry from "@sentry/react";

posthog.onFeatureFlags(() => {
  Sentry.setTag("posthog_session_id", posthog.get_session_id());
  Sentry.setTag("posthog_distinct_id", posthog.get_distinct_id());
});
```

Olha o erro no Sentry → copia o `posthog_session_id` → busca no PostHog → vê o replay/eventos da mesma sessão.

---

## 4. Core Web Vitals

```ts
// src/lib/observability/web-vitals.ts
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";
import * as Sentry from "@sentry/react";
import { posthog } from "./posthog";

function report(metric: Metric) {
  // Sentry: como measurement no transaction atual
  Sentry.setMeasurement(metric.name, metric.value, metric.name === "CLS" ? "" : "millisecond");

  // PostHog: como evento (para dashboards de UX)
  posthog.capture("$web_vitals", {
    metric_name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
  });
}

export function trackWebVitals() {
  onCLS(report);
  onINP(report);
  onLCP(report);
  onFCP(report);
  onTTFB(report);
}
```

```bash
pnpm add web-vitals
```

```ts
// src/main.tsx
trackWebVitals();
```

---

## 5. Correlação com backend (traceId)

Backend Fastify retorna `traceId` em todo erro 4xx/5xx (veja docs do backend). Adicione como tag em Sentry:

```ts
// src/api/client.ts (trecho — já existe esse client wrapper, veja KUBB.md)
import * as Sentry from "@sentry/react";

if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  const traceId = body.error?.traceId;

  if (res.status >= 500) {
    Sentry.captureException(new ApiError(...), {
      tags: { trace_id: traceId },
      extra: { url: config.url, method: config.method },
    });
  }

  throw new ApiError(res.status, body.error?.code, body.error?.message, traceId);
}
```

No Sentry, filtra por tag `trace_id` para achar logs do backend correspondentes no CloudWatch.

---

## 6. Privacidade e LGPD

### 6.1 Mascaramento

- **Inputs sensíveis** (CPF, cartão, senha) — `maskAllInputs: true` no replay.
- **Conteúdo de tela com PII** — adicione classe `.sentry-mask` ou `.ph-no-capture`.
  ```tsx
  <span className="sentry-mask ph-no-capture">{user.cpf}</span>
  ```

### 6.2 Cookie / consent

Em apps B2B internos com login Cognito, opt-in implícito (termos de uso). Para apps abertos ao público, precisa de banner de cookies:

```tsx
// componente CookieBanner que chama posthog.opt_in_capturing() ou posthog.opt_out_capturing()
```

Sentry tem `Sentry.getClient()?.close()` para parar coleta se usuário negar.

### 6.3 IPs e geolocalização

PostHog coleta IP por padrão para geolocation. Para desligar:

```ts
posthog.init(key, {
  // ...
  ip: false,
  property_blacklist: ["$ip", "$geoip_country_name"],
});
```

LGPD: IP é dado pessoal. Se não precisar de geolocation, desligue.

---

## 7. Custos esperados

**Sentry** (plano Team 2026):
- $26/mês base, 50k errors + 10k replays.
- Apps B2B internos com < 100 usuários ativos raramente passam disso.
- Performance traces consomem rapidamente — use `tracesSampleRate: 0.1` em prod.

**PostHog Cloud**:
- 1M events/mês grátis (mais que suficiente p/ B2B).
- Acima disso: $0.00031/event.
- Session replay: 5k grátis/mês.

**Self-host de qualquer um**: viável se time AWS forte; trabalho de manutenção.

---

## 8. Em desenvolvimento

Ambos **desligados** por default em `NODE_ENV=development`. Para testar:

```bash
VITE_SENTRY_DSN=... pnpm dev
```

PostHog tem **PostHog Toolbar** — overlay no app em dev que mostra eventos sendo capturados ao vivo. Útil pra validar tracking de novo evento.

---

## 9. Pipeline (CI/CD)

### 9.1 Variáveis necessárias

| Var | Onde | Quando |
|---|---|---|
| `VITE_SENTRY_DSN` | SSM, em `VITE_*` build args | Build |
| `VITE_POSTHOG_KEY` | SSM | Build |
| `VITE_POSTHOG_HOST` | SSM | Build |
| `VITE_APP_VERSION` | git SHA, gerado no build | Build |
| `SENTRY_AUTH_TOKEN` | Secrets Manager (não inline no JS!) | Build-only, p/ upload sourcemap |

### 9.2 buildspec (trecho)

```yaml
phases:
  install:
    commands:
      - corepack enable
      - pnpm install --frozen-lockfile
  pre_build:
    commands:
      - export VITE_APP_VERSION=$(git rev-parse --short HEAD)
      - pnpm api:generate
  build:
    commands:
      - pnpm build
      # Sentry vite plugin já fez upload + deletou .map files
```

Sourcemaps são deletados após upload (não servidos publicamente).

---

## 10. Dashboards mínimos

### 10.1 Sentry — issues
- Filtre por `environment:production`.
- Alerta Slack/Email: > 10 erros novos em 1h, ou error rate > 5% em 5 min.

### 10.2 PostHog — funnels
- Funnel: `pageview /login` → `user_logged_in` → `pageview /dashboard`. Drop-off > 30% é red flag.
- Dashboard de Core Web Vitals: p75 LCP, p75 INP por rota.

### 10.3 Alertas críticos
- Sentry: error rate spike (relativo a baseline).
- PostHog: queda de signup rate (se aplicável).

---

## 11. Quando NÃO usar

- **Tracking que viole LGPD/privacy** — antes de capturar, valide com legal/security.
- **Em telas com dados extremamente sensíveis** (financeiro, médico): desligue replay específico via classes / segmento.
- **Não loggue tokens, passwords, números de cartão.** Filtros `beforeSend` do Sentry + classes de mascaramento.

---

## 12. Checklist de observabilidade

- [ ] Sentry inicializado antes do React mount
- [ ] Source maps fazem upload no build, são deletados antes do deploy
- [ ] `release` no Sentry usa git SHA
- [ ] PostHog inicializado com `capture_pageview: false`
- [ ] Pageviews disparados via subscription do Router
- [ ] `identifyUser`/`clearUserIdentity` chamados no login/logout
- [ ] Inputs com `maskAllInputs: true` no replay
- [ ] Classes `.sentry-mask` / `.ph-no-capture` em PII visível
- [ ] `tracesSampleRate: 0.1` em produção
- [ ] Replay: 10% sessões / 100% com erro
- [ ] Eventos de produto críticos têm `posthog.capture`
- [ ] Web vitals reportando pra Sentry + PostHog
- [ ] `traceId` do backend correlacionado em erros de API
- [ ] Alerta Sentry configurado (Slack/email)
