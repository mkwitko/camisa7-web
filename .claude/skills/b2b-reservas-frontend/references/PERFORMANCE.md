# PERFORMANCE.md — Performance no Frontend

> O usuário sente performance em **milissegundos visíveis**: o quanto demora pra ver, pra clicar, pra responder. Métricas oficiais: **Core Web Vitals** do Google. Targets agressivos abaixo.

---

## 1. SLOs

| Métrica | Alvo | Limite | Como medir |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | < 1.5s | 2.5s | Lighthouse, RUM |
| **INP** (Interaction to Next Paint) | < 100ms | 200ms | Lighthouse, RUM |
| **CLS** (Cumulative Layout Shift) | < 0.05 | 0.1 | Lighthouse, RUM |
| **FCP** (First Contentful Paint) | < 1s | 1.8s | Lighthouse |
| **TBT** (Total Blocking Time) | < 200ms | 600ms | Lighthouse |
| **TTI** (Time to Interactive) | < 2.5s | 4s | Lighthouse |
| Bundle inicial (gzipped) | < 200KB | 350KB | `pnpm analyze` (vite-bundle-visualizer) |
| Lighthouse Performance | > 90 | 80 | Lighthouse |

**O que cada métrica significa em linguagem humana:**
- **LCP**: quando o maior elemento visível (hero image, título principal) aparece. "Página parece pronta."
- **INP**: latência da pior interação durante a sessão. "Site responde rápido?"
- **CLS**: o quanto a página "pula" enquanto carrega. "Layout estável?"
- **FCP**: primeiro pixel pintado.
- **TBT**: tempo total que main thread ficou bloqueado > 50ms.

---

## 2. Vite build — extrair o máximo

### 2.1 `vite.config.ts` (estado atual do repo)

```ts
/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // DEVE vir antes do @vitejs/plugin-react
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,           // code splitting por rota
      generatedRouteTree: "src/routes.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: { /* ... ver TESTING.md ... */ },
});
```

> **Não há `build.rollupOptions.manualChunks`, plugin `rollup-plugin-visualizer`, nem `server.proxy` configurados** hoje. O code splitting vem do `autoCodeSplitting` do TanStack Router (por rota). A análise de bundle usa o CLI `vite-bundle-visualizer` (`pnpm analyze`), não o plugin. O exemplo de `manualChunks`/`visualizer` abaixo é o **alvo recomendado** quando o bundle crescer — adicione um bloco `build` ao config.

### 2.2 Targets de build

- **ES2022.** Cobre 95%+ dos browsers em uso em 2026. (Vite usa o default `es2022`/`esbuild`; não há `build.target` explícito no config.)
- **Source maps:** não habilitados no config atual (`build.sourcemap` ausente). Ative `sourcemap: true` + upload pro Sentry quando for instrumentar releases.

---

## 3. Code splitting

### 3.1 Por rota (automático com TanStack Router)

TanStack Router faz code splitting por rota nativamente. Cada arquivo em `src/routes/` vira chunk separado.

### 3.2 Manual — lazy load de componentes pesados

```tsx
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const HeavyChart = lazy(() => import("@/components/dashboard/heavy-chart"));

function Dashboard() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <HeavyChart />
    </Suspense>
  );
}
```

**Candidatos a lazy load:**
- Bibliotecas grandes (charts, editores ricos, PDFs).
- Páginas raramente acessadas.
- Modais/dialogs complexos abertos sob demanda.

### 3.3 Não code split exageradamente

Cada chunk gera um request. Em rede ruim, muitos chunks pequenos podem ser **pior** que poucos chunks médios. **Regra:** code split o que passa de 30KB gzipped.

---

## 4. LCP — pintar rápido

### 4.1 Critical CSS inline

Vite já injeta CSS crítico no `<head>`. Sem precisar ferramenta extra.

### 4.2 Fonts

Self-host fonts. Não puxe de Google Fonts CDN (DNS extra, render blocking).

```css
/* src/styles/globals.css */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap; /* mostra fallback enquanto carrega */
  src: url("/fonts/inter.var.woff2") format("woff2");
}
```

**Preload no `index.html`:**

```html
<link rel="preload" href="/fonts/inter.var.woff2" as="font" type="font/woff2" crossorigin />
```

### 4.3 Imagens hero

- **Sempre `width` e `height`** explícitos (evita CLS).
- `loading="eager"` + `fetchpriority="high"` na imagem do LCP.
- `loading="lazy"` em todas as demais.
- Formatos modernos: WebP, AVIF.

```tsx
<img
  src="/hero.webp"
  width={1200}
  height={600}
  loading="eager"
  fetchpriority="high"
  alt=""
/>
```

### 4.4 Pré-conectar a origens críticas

```html
<link rel="preconnect" href="https://api.b2b-reservas.com" />
<link rel="preconnect" href="https://b2b-reservas.auth.sa-east-1.amazoncognito.com" />
```

---

## 5. INP — interações rápidas

### 5.1 Não bloqueie a main thread

- **Sem cálculos pesados em handlers de click.** Mova para `requestIdleCallback` ou Web Worker.
- **Sem `JSON.parse` de payloads > 1MB.** Stream.
- **Debounce** em inputs de busca (300-500ms).
- **Throttle** em scroll/mousemove.

### 5.2 Virtualização para listas longas

Para listas com > 200 items, use `@tanstack/react-virtual`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function BigList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-96 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }} className="relative">
        {virtualizer.getVirtualItems().map((virtual) => (
          <div
            key={virtual.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtual.start}px)`,
              height: virtual.size,
            }}
          >
            {items[virtual.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5.3 React 18 features

- **`useTransition`** para updates não-urgentes (filtros, ordenação).
- **`useDeferredValue`** para inputs reativos sem travar.

```tsx
const [search, setSearch] = useState("");
const deferredSearch = useDeferredValue(search);

// FilterList usa deferredSearch — não bloqueia digitação
<FilterList search={deferredSearch} />
```

---

## 6. CLS — layout estável

Causas comuns:

| Causa | Solução |
|---|---|
| Imagem sem dimensão | `width`/`height` ou `aspect-ratio` CSS |
| Fonte trocando estilo | `font-display: swap` + métricas-fallback próximas |
| Anúncios/embeds carregando depois | Reserve espaço com `min-height` |
| Skeleton com tamanho diferente do conteúdo | Skeleton com dimensões reais |
| Toast/banner empurrando conteúdo | Use `position: fixed` ou portal |

**Pratique:** abra DevTools → Performance → Highlight Layout Shift Regions. Em desenvolvimento, qualquer shift fica visível.

---

## 7. Network

### 7.1 Cache HTTP em CloudFront

```
HTML (index.html):        Cache-Control: no-cache (sempre revalida)
JS/CSS com hash:          Cache-Control: public, max-age=31536000, immutable
Fontes:                   Cache-Control: public, max-age=31536000, immutable
Imagens estáticas:        Cache-Control: public, max-age=2592000 (30 dias)
```

`index.html` `no-cache` garante que mudanças aparecem imediatamente após deploy. Arquivos com hash são imutáveis (filename muda a cada build).

### 7.2 Brotli

CloudFront serve Brotli (`Content-Encoding: br`) automaticamente para clients que aceitam. ~20% menor que gzip.

### 7.3 HTTP/2 / HTTP/3

CloudFront suporta nativamente. Multiplexing significa que muitos chunks pequenos custam menos do que custariam em HTTP/1.

### 7.4 Prefetch de rotas

TanStack Router suporta:

```tsx
<Link to="/users" preload="intent">Usuários</Link>
```

`intent` faz prefetch ao hover/touch-start. Reduz click→navigate para perto de zero.

---

## 8. Bundle analysis

```bash
pnpm analyze
# = vite build && vite-bundle-visualizer — abre relatório treemap no browser
```

**O que procurar:**
- Lib grande inesperada (moment.js inteiro? Substitua por date-fns ou dayjs).
- Duplicação (`lodash` + `lodash-es`? Padronize).
- Polyfills desnecessários (verifique browserslist).
- Imports default que trazem lib inteira (`import _ from "lodash"` puxa tudo; use `import debounce from "lodash/debounce"` ou `lodash-es` com tree-shaking).

### 8.1 Substituições comuns

| Substitua | Por | Por quê |
|---|---|---|
| moment | date-fns ou dayjs | ~70KB → ~2-10KB |
| lodash | lodash-es ou implementações inline | tree-shaking; muitas funções nativas no JS hoje |
| uuid | `crypto.randomUUID()` | nativo, zero KB |
| classnames | clsx | menor, mesma API |

---

## 9. RUM (Real User Monitoring)

Métricas de Lighthouse são lab; **RUM** mede usuários reais. Web Vitals coletados por `web-vitals` lib, enviados para Sentry (como measurements em transactions) e PostHog (como evento `$web_vitals` para dashboards de UX).

Setup completo em [`OBSERVABILITY.md`](./OBSERVABILITY.md#4-core-web-vitals). Resumo:

```ts
// src/lib/observability/web-vitals.ts
import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals";
import * as Sentry from "@sentry/react";
import { posthog } from "./posthog";

function report(metric) {
  Sentry.setMeasurement(metric.name, metric.value, metric.name === "CLS" ? "" : "millisecond");
  posthog.capture("$web_vitals", { metric_name: metric.name, value: metric.value, rating: metric.rating });
}

export function trackWebVitals() {
  onCLS(report); onINP(report); onLCP(report); onFCP(report); onTTFB(report);
}
```

No PostHog crie um dashboard com **p75 LCP** e **p75 INP** por rota; no Sentry use as measurements para alertas de regressão.

---

## 10. Lighthouse no CI

> Hoje existe só o script `pnpm lighthouse` (`lighthouse http://localhost:4173 --view`) — execução **manual** contra o `preview`. Não há `pnpm lighthouse:ci` nem `.lighthouserc.json` no repo. O setup abaixo (`@lhci/cli`) é o alvo recomendado pra rodar em PR e prevenir regressão:

```yaml
# buildspec.yml (trecho) — alvo recomendado
- pnpm build
- pnpm lighthouse:ci
```

```json
// .lighthouserc.json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173/", "http://localhost:4173/users"],
      "startServerCommand": "pnpm preview",
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.8 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }]
      }
    }
  }
}
```

---

## 11. Profiling em dev

### 11.1 React DevTools Profiler

1. Abra DevTools → Profiler tab.
2. Clique gravar, faça a interação lenta.
3. Veja flamegraph de cada render.

Cuidado: profiling em dev é mais lento que produção. Use **Profiling Build** se quiser dado preciso.

### 11.2 Identificar re-renders excessivos

```tsx
// Adicione em dev: hook custom que loga quando muda referência
import { useEffect, useRef } from "react";

export function useTraceUpdate(props: Record<string, unknown>) {
  const prev = useRef(props);
  useEffect(() => {
    const changed: Record<string, unknown> = {};
    for (const k of Object.keys(props)) {
      if (prev.current[k] !== props[k]) changed[k] = { from: prev.current[k], to: props[k] };
    }
    if (Object.keys(changed).length) console.log("changed:", changed);
    prev.current = props;
  });
}
```

### 11.3 `React.memo` quando justificado

```tsx
const ExpensiveRow = React.memo(function ExpensiveRow(props: Props) {
  // ...
});
```

**Não memoize tudo.** `memo` só ajuda se a comparação de props for mais barata que o re-render. Em componentes pequenos, é overhead.

---

## 12. Checklist de performance

Antes de mergear feature pesada:

- [ ] Bundle delta < 50KB gzipped (rode `pnpm analyze`)
- [ ] Lighthouse Performance > 90 nas rotas afetadas
- [ ] LCP < 1.5s em conexão simulada Fast 3G
- [ ] Sem CLS visível ao carregar
- [ ] Sem layout thrashing em scroll
- [ ] Imagens com dimensões + `loading` apropriado
- [ ] Listas > 200 items virtualizadas
- [ ] Componentes pesados lazy loaded
- [ ] Queries TanStack com `staleTime` apropriado
- [ ] React DevTools Profiler — sem cascata de re-renders
