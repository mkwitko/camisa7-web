# DOCKER.md — Docker (apenas produção)

> Dev local é **`pnpm dev` direto na máquina** — sem Docker, sem compose. O Vite com HMR é mais rápido fora de container, especialmente em macOS/Windows. Docker é só pra build de produção (ou casos como preview em PR via ECS).

---

## 1. Filosofia

- **Dev:** `pnpm dev` local. O client chama `VITE_API_BASE_URL` direto (não há proxy `/api` no `vite.config.ts`); aponte a env para o backend local/staging.
- **Prod:** multi-stage build → assets estáticos servidos por Nginx (ou direto do S3+CloudFront em deploy real).

**Por que sem Docker em dev:**
- Bind mount no Docker Desktop é lento em macOS/Windows (mesmo com FUSE).
- `pnpm install` no host vs container divergem em arquitetura (Apple Silicon vs amd64 do container) — `node_modules` exige volume nomeado, complicação extra.
- HMR via WebSocket fica menos confiável atrás de bridge network.
- Vite local arranca em < 1s; dentro de container, 5-10s.

Backend pode rodar local ou via Compose próprio. Frontend só conecta via HTTP — não precisa estar na mesma rede Docker.

---

## 2. Dev local — sem Docker

```bash
# Instala deps
pnpm install

# Gera tipos da API (Kubb)
pnpm api:generate

# Sobe Vite
pnpm dev
```

Vite roda em `http://localhost:5173` (`server.port` no `vite.config.ts`). **Não há `server.proxy`** — o client usa `VITE_API_BASE_URL` como base completa.

Vars relevantes em `.env.local`:

```bash
VITE_ENV=development
VITE_API_BASE_URL=http://localhost:3000                   # backend direto (sem proxy)
VITE_COGNITO_USER_POOL_ID=us-east-1_xxx
VITE_COGNITO_CLIENT_ID=xxx
VITE_COGNITO_REGION=us-east-1
VITE_COOKIE_DOMAIN=localhost
VITE_HUB_URL=https://hub.empresa.com
```

> Nomes corretos: `VITE_COGNITO_CLIENT_ID` e `VITE_COOKIE_DOMAIN` (não `APP_CLIENT_ID`/`COGNITO_COOKIE_DOMAIN`). Schema completo em `src/env.ts`.

> Pro fluxo de auth em dev, ver [`AUTH.md` §9](./AUTH.md#9-test-mode-e2e-e-local-sem-hub) (modo `VITE_ENV=test`).

---

## 3. Prod — Dockerfile multi-stage com Nginx

Mesmo que o deploy normal seja S3 + CloudFront, ter um Dockerfile de prod é útil pra:
- Preview em PR (container temporário em ECS).
- Self-hosted fallback.
- Smoke test em pipeline (build → start container → curl).

```dockerfile
# docker/Dockerfile (estado atual do repo) — 2 stages
# syntax=docker/dockerfile:1
# Imagem de PRODUÇÃO apenas — dev local é `pnpm dev` direto (sem container).

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
# As envs VITE_* são embutidas no bundle em build time (passe via --build-arg).
ARG VITE_API_BASE_URL
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_COGNITO_REGION
ARG VITE_COOKIE_DOMAIN
ARG VITE_HUB_URL
ARG VITE_SENTRY_DSN
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_ENV=production
RUN pnpm build

# --- serve ---
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

> Diferenças do "padrão de livro": são **2 stages** (não 3, sem stage `deps` separado), `node:22-alpine`, **porta 80** (não 8080), **sem `HEALTHCHECK`**, e o build **não roda `pnpm api:generate`** — assume que `src/api/generated/` está presente. ⚠️ Como `src/api/generated/` é gitignored, ou ele precisa estar commitado, ou o Dockerfile deveria rodar `pnpm api:generate` antes de `pnpm build`. Os nomes das envs são `VITE_COGNITO_CLIENT_ID`, `VITE_COOKIE_DOMAIN`, `VITE_COGNITO_REGION`, `VITE_HUB_URL` (não `APP_CLIENT_ID`/`COGNITO_COOKIE_DOMAIN`/`APP_VERSION`).

### 3.1 `nginx.conf` para SPA

```nginx
# docker/nginx.conf (estado atual do repo)
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # Assets com hash: cache longo e imutável.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # SPA fallback: toda rota não-arquivo cai no index.html.
  location / {
    add_header Cache-Control "no-cache";
    try_files $uri $uri/ /index.html;
  }
}
```

**Pontos chave:**
- `try_files $uri $uri/ /index.html` — qualquer rota não encontrada cai no SPA (essencial para client-side routing).
- `location /assets/` (assets do Vite com hash) → `immutable`.
- `index.html` → `no-cache` (release imediato após deploy).
- `listen 80`. **Não há endpoint `/health` nem headers de segurança** no nginx.conf atual — CSP/headers ficam no CloudFront (ver [`DEPLOYMENT.md`](./DEPLOYMENT.md)). Adicione um `location = /health` se for usar HEALTHCHECK em ECS.

### 3.2 Build

```bash
docker build \
  --build-arg VITE_ENV=production \
  --build-arg VITE_API_BASE_URL=https://api.b2b-reservas.com \
  --build-arg VITE_COGNITO_USER_POOL_ID=us-east-1_xxx \
  --build-arg VITE_COGNITO_CLIENT_ID=xxx \
  --build-arg VITE_COGNITO_REGION=us-east-1 \
  --build-arg VITE_COOKIE_DOMAIN=b2b-reservas.com \
  --build-arg VITE_HUB_URL=https://hub.empresa.com \
  --build-arg VITE_SENTRY_DSN=https://... \
  --build-arg VITE_POSTHOG_KEY=phc_... \
  --build-arg VITE_POSTHOG_HOST=https://us.i.posthog.com \
  -f docker/Dockerfile \
  -t b2b-reservas-web:latest \
  .
```

**Importante:** `VITE_*` vars são **build-time** (inlined no JS final), não runtime. Mude valores → rebuild da imagem. Ver [`DEPLOYMENT.md`](./DEPLOYMENT.md) sobre env vars no pipeline.

---

## 4. `.dockerignore`

```
node_modules
dist
.git
.github
*.log
.env*
.vscode
.idea
coverage
playwright-report
test-results
.DS_Store
infra
*.md
```

> Não ignore `api.json` (é o input commitado do Kubb) nem `src/api/generated/` se o build não rodar `pnpm api:generate` (o Dockerfile atual não roda — ver §3). Não há `.dockerignore` no repo hoje; este é um exemplo recomendado.

Evita copiar lixo grande pro build context (acelera build, reduz cache invalidation).

---

## 5. Verificação local de build de prod

```bash
docker build -f docker/Dockerfile \
  --build-arg VITE_ENV=production \
  --build-arg VITE_API_BASE_URL=http://localhost:3000 \
  --build-arg VITE_COGNITO_USER_POOL_ID=fake \
  --build-arg VITE_COGNITO_CLIENT_ID=fake \
  --build-arg VITE_COGNITO_REGION=us-east-1 \
  --build-arg VITE_COOKIE_DOMAIN=localhost \
  --build-arg VITE_HUB_URL=https://hub.empresa.com \
  -t web-test .

docker run --rm -p 8080:80 web-test
# abre http://localhost:8080
```

Bom para validar o produto final antes de deploy. Auth não funciona (env fake), mas serve pra checar build, rotas SPA, headers Nginx.

---

## 6. Tamanho da imagem

Imagem final típica: **~30-50MB** (Nginx Alpine + dist/). Pra reduzir mais:
- `nginx:alpine-slim` (~10MB menor).
- Multi-platform builds com `docker buildx` pra arm64 (ECS Graviton mais barato).

---

## 7. Troubleshooting

**"Cannot read of undefined" em prod mas funciona em dev**
Provavelmente env var faltando no build. `VITE_*` precisa estar presente no `docker build --build-arg` (não basta no `docker run`).

**Vite "Failed to fetch dynamically imported module" depois de deploy**
Cache do navegador apontando para chunk antigo. `index.html` com `no-cache` corrige no próximo refresh. Service worker (se houver) precisa atualizar.

**Bundle muito grande**
Rode `pnpm analyze` localmente. Ver [`PERFORMANCE.md`](./PERFORMANCE.md).

---

## 8. Checklist Docker

- [ ] Dev local roda com `pnpm dev` direto (sem Docker)
- [ ] `VITE_API_BASE_URL` aponta pro backend (local ou staging) — sem proxy
- [ ] Dockerfile prod é multi-stage (build → nginx)
- [ ] `nginx.conf` com SPA fallback (`$uri $uri/ /index.html`) + cache em `/assets/`
- [ ] Build args pra todas as `VITE_*` vars (nomes corretos: `VITE_COGNITO_CLIENT_ID`, `VITE_COOKIE_DOMAIN`, `VITE_COGNITO_REGION`, `VITE_HUB_URL`)
- [ ] Imagem prod < 100MB
- [ ] Geração do client Kubb garantida antes do build (gerado commitado **ou** `pnpm api:generate` no Dockerfile)
- [ ] Nginx escuta na porta **80** (mapeie no `docker run`/ECS conforme necessário)
