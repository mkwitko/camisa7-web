# DEPLOYMENT.md — Deploy S3 + CloudFront via CDK + CodePipeline

> Frontend é estático: build gera `dist/`, sincroniza para S3, invalida CloudFront. AWS CDK descreve tudo (`infra/`). Não há scripts `deploy:*` no `package.json` — o deploy é via `cdk deploy` dentro de `infra/`.

> ⚠️ **Estado atual do repo: `infra/` é um scaffold mínimo.** As stacks reais (`infra/bin/app.ts`, `infra/lib/static-site-stack.ts`, `infra/lib/pipeline-stack.ts`) são **bem mais simples** que o setup completo documentado em §2–§3 (que é o **alvo recomendado**). O que existe hoje:
> - **`StaticSiteStack`** (`RfpFrontendSite`): bucket S3 privado (encrypted, `BLOCK_ALL`, `enforceSSL`, `RETAIN`) + CloudFront com OAC, `PRICE_CLASS_100`, `defaultRootObject: index.html`, fallback 403/404 → `/index.html`. **Sem** domínio custom/ACM, Route53, Response Headers Policy (CSP), logging bucket, versionamento, nem behavior separado pro `index.html`.
> - **`PipelineStack`** (`RfpFrontendPipeline`): source **CodeCommit** (repo `rfp-frontend`, branch `develop`) → CodeBuild (Node 22, `pnpm install` + `pnpm build`) → `S3DeployAction` → invalidação `/*` no `post_build`. **Sem** SSM Parameter Store, Secrets Manager, `pnpm api:generate`/`typecheck`/`check`/`test:run`, nem approval manual.

## 1. Arquitetura de deploy (estado atual)

```
[Git push develop no CodeCommit]
        ↓
[CodePipeline RfpFrontendPipeline] dispara
        ↓
[CodeBuild] (Node 22)
  - corepack enable
  - pnpm install --frozen-lockfile
  - pnpm build          (api.json é fixture commitada; sem fetch de OpenAPI)
        ↓
[S3DeployAction: dist/ → bucket do StaticSiteStack]
        ↓
[post_build] aws cloudfront create-invalidation --paths "/*"
```

> O alvo recomendado (§2–§3) adiciona testes/typecheck/lint no build, env via SSM, approval em prod e invalidação seletiva. Migre o scaffold pra lá conforme o projeto amadurece.

---

## 2. CDK Stack — site estático (alvo recomendado, mais rico que o scaffold atual)

```ts
// infra/lib/static-site-stack.ts
import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";

interface Props extends StackProps {
  envName: "staging" | "prod";
  domainName: string;            // app.b2b-reservas.com
  hostedZoneName: string;        // b2b-reservas.com
  certificateArn: string;        // ACM cert em us-east-1
}

export class StaticSiteStack extends Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // 1. Bucket privado (acesso apenas via CloudFront)
    this.bucket = new s3.Bucket(this, "WebBucket", {
      bucketName: `web-b2b-reservas-${props.envName}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,           // permite rollback rápido
      lifecycleRules: [
        {
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
      removalPolicy: props.envName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // 2. Certificate em us-east-1 (CloudFront só aceita lá)
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Cert",
      props.certificateArn,
    );

    // 3. OAC (Origin Access Control) — modo recomendado, substitui OAI legacy
    const oac = new cloudfront.S3OriginAccessControl(this, "OAC", {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // 4. Distribution
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: this.createSecurityHeadersPolicy(),
      },
      // Cache específico pro index.html
      additionalBehaviors: {
        "/index.html": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
            originAccessControl: oac,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          compress: true,
        },
      },
      defaultRootObject: "index.html",
      // SPA: fallback de 403/404 para index.html
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.seconds(0),
        },
      ],
      domainNames: [props.domainName],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // só edge NA/EU; ajuste se LATAM crítico
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      logBucket: new s3.Bucket(this, "LogsBucket", {
        lifecycleRules: [{ expiration: Duration.days(90) }],
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // 5. Route53 A record alias
    const hostedZone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: props.hostedZoneName,
    });
    new route53.ARecord(this, "DnsRecord", {
      zone: hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      ),
    });
  }

  private createSecurityHeadersPolicy() {
    return new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'", // Tailwind inline styles
            "img-src 'self' data: https:",
            "font-src 'self'",
            [
              "connect-src 'self'",
              "https://api.b2b-reservas.com",
              "https://*.amazoncognito.com",
              "https://*.sentry.io",                // Sentry events + replay
              "https://us.i.posthog.com",           // PostHog ingest (ajuste para EU/região se aplicável)
              "https://us-assets.i.posthog.com",    // PostHog assets
            ].join(" "),
            "worker-src 'self' blob:",              // Session replay usa workers
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self' https://*.amazoncognito.com",
          ].join("; "),
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });
  }
}
```

**Pontos importantes:**
- **OAC (Origin Access Control)** — substitui OAI legacy. Bucket privado, CloudFront usa SigV4 para acessar.
- **Errors 403/404 → 200 + `/index.html`** — essencial para SPA routing client-side.
- **Behavior específico para `/index.html`** → `CACHING_DISABLED` para release imediato. Resto cacheia 1 ano via `CACHING_OPTIMIZED` (hash no filename = imutável).
- **CSP** via headers policy do CloudFront, não meta tag (mais seguro).
- **HTTP/2 + HTTP/3** habilitados.
- **PriceClass 100** = só edges NA/EU (mais barato). Use `PRICE_CLASS_ALL` se latência LATAM importa muito.

---

## 3. Pipeline (alvo recomendado — o scaffold atual usa CodeCommit + build simples)

```ts
// infra/lib/pipeline-stack.ts (versão-alvo; ver nota no topo pro que existe hoje)
import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";

interface Props extends StackProps {
  envName: "staging" | "prod";
  branch: string;
  repoOwner: string;
  repoName: string;
  connectionArn: string;
  webBucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
}

export class WebPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const sourceOutput = new codepipeline.Artifact("Source");
    const buildOutput = new codepipeline.Artifact("Build");

    const project = new codebuild.PipelineProject(this, "BuildProject", {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        env: {
          "parameter-store": {
            VITE_API_BASE_URL: `/b2b-reservas/${props.envName}/web/api-base-url`,
            VITE_COGNITO_DOMAIN: `/b2b-reservas/${props.envName}/web/cognito-domain`,
            VITE_COGNITO_CLIENT_ID: `/b2b-reservas/${props.envName}/web/cognito-client-id`,
            VITE_SENTRY_DSN: `/b2b-reservas/${props.envName}/web/sentry-dsn`,
            VITE_POSTHOG_KEY: `/b2b-reservas/${props.envName}/web/posthog-key`,
            VITE_POSTHOG_HOST: `/b2b-reservas/${props.envName}/web/posthog-host`,
            OPENAPI_URL: `/b2b-reservas/${props.envName}/api/openapi-url`,
          },
          "secrets-manager": {
            // Token só para upload de sourcemaps; NÃO vai pro bundle final
            SENTRY_AUTH_TOKEN: `b2b-reservas/${props.envName}/web/sentry-auth-token`,
          },
        },
        phases: {
          install: {
            "runtime-versions": { nodejs: "20" },
            commands: ["corepack enable", "pnpm install --frozen-lockfile"],
          },
          pre_build: {
            commands: [
              "export VITE_APP_VERSION=$(git rev-parse --short HEAD)",
              "pnpm api:generate",
              "pnpm check",
              "pnpm typecheck",
              "pnpm test:run",
            ],
          },
          build: {
            // Vite Sentry plugin lê SENTRY_AUTH_TOKEN do env, faz upload de sourcemaps,
            // e deleta os .map files antes do artefato ser empacotado
            commands: ["pnpm build"],
          },
        },
        artifacts: {
          "base-directory": "dist",
          files: ["**/*"],
        },
        cache: {
          paths: ["node_modules/.cache/**/*", ".pnpm-store/**/*"],
        },
      }),
      timeout: Duration.minutes(20),
    });

    // Permissões para SSM, Secrets Manager, CloudFront invalidation, S3
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameters", "ssm:GetParameter"],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/b2b-reservas/*`],
    }));
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:b2b-reservas/*`],
    }));

    new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: `web-b2b-reservas-${props.envName}`,
      crossAccountKeys: false,
      stages: [
        {
          stageName: "Source",
          actions: [
            new actions.CodeStarConnectionsSourceAction({
              actionName: "Source",
              connectionArn: props.connectionArn,
              owner: props.repoOwner,
              repo: props.repoName,
              branch: props.branch,
              output: sourceOutput,
              triggerOnPush: true,
            }),
          ],
        },
        {
          stageName: "Build",
          actions: [
            new actions.CodeBuildAction({
              actionName: "BuildAndTest",
              project,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        ...(props.envName === "prod" ? [{
          stageName: "Approval",
          actions: [
            new actions.ManualApprovalAction({
              actionName: "ApproveProd",
              additionalInformation: "Verifique smoke tests em staging antes de aprovar.",
            }),
          ],
        }] : []),
        {
          stageName: "Deploy",
          actions: [
            new actions.S3DeployAction({
              actionName: "Deploy",
              bucket: props.webBucket,
              input: buildOutput,
              cacheControl: [
                // index.html: no-cache (sempre revalida)
                actions.CacheControl.fromString("public, max-age=0, must-revalidate"),
              ],
              extract: true,
            }),
            new actions.CodeBuildAction({
              actionName: "Invalidate",
              project: this.createInvalidateProject(props.distribution),
              input: buildOutput,
              runOrder: 2,
            }),
          ],
        },
      ],
    });
  }

  private createInvalidateProject(dist: cloudfront.IDistribution) {
    const project = new codebuild.PipelineProject(this, "InvalidateProject", {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              `aws cloudfront create-invalidation --distribution-id ${dist.distributionId} --paths "/index.html" "/"`,
            ],
          },
        },
      }),
    });
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cloudfront:CreateInvalidation"],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${dist.distributionId}`],
    }));
    return project;
  }
}
```

**Pontos importantes:**
- **Cache control sobreescrito para index.html** — `must-revalidate`. Assets continuam com `immutable` (default do upload).
- **Invalidação apenas em `/index.html`** — assets têm hash; não precisam invalidar. Salva custo (10/mês grátis, depois $0.005 por path).
- **Approval manual em prod.** Staging deploya automaticamente.
- **OPENAPI_URL no SSM** — aponta para `https://api.staging.b2b-reservas.com/docs/json` ou similar.

---

## 4. Cross-repo: ordem de deploy

Backend e frontend são repos separados. Mudança de schema breaking exige coordenação.

### 4.1 Mudança backward-compatible

1. PR no backend → merge → deploy staging.
2. PR no frontend usa novo campo opcional → merge → deploy staging.
3. Aprovação prod do backend (independente).
4. Aprovação prod do frontend (independente).

### 4.2 Breaking change

**Two-deploy pattern** (igual schema do DB):

1. **Backend v1:** introduz campo novo opcional, mantém antigo.
2. **Frontend:** muda para usar campo novo.
3. **Backend v2:** remove campo antigo (só depois do frontend estar 100% em prod).

Nunca remova um campo no mesmo deploy que faz o front mudar; haverá janela de erro.

### 4.3 Como o frontend obtém o OpenAPI no build

Opções (escolha **uma**):

**A) Direto do endpoint** (mais simples)
- Backend staging expõe `/docs/json`.
- CodeBuild faz `curl $OPENAPI_URL > openapi.json`.
- Risco: se backend de staging estiver down no momento do build do frontend, build falha.

**B) Publicado em S3 por deploy do backend** (mais robusto)
- Backend, no seu deploy, sobe `openapi.json` para `s3://api-contracts/staging/openapi.json`.
- Frontend baixa de lá.
- Versão estável, sem dependência runtime.

Recomendado **B** para projetos sérios. Configure permissão de leitura do bucket para o role do CodeBuild do frontend.

---

## 5. Env vars do frontend — build time, não runtime

Como o frontend é estático (HTML+JS+CSS), `VITE_*` vars são **substituídas em build**. Trocar valor exige rebuild.

```ts
// src/env.ts (estado atual do repo)
import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_COGNITO_USER_POOL_ID: z.string().min(1),
  VITE_COGNITO_CLIENT_ID: z.string().min(1),
  VITE_COGNITO_REGION: z.string().min(1),
  VITE_COOKIE_DOMAIN: z.string().min(1).default("localhost"),
  VITE_HUB_URL: z.string().url(),
  VITE_SENTRY_DSN: z.string().optional().default(""),
  VITE_POSTHOG_KEY: z.string().optional().default(""),
  VITE_POSTHOG_HOST: z.string().url().optional().default("https://us.i.posthog.com"),
  VITE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Configuração de ambiente inválida. Veja .env.example.");
}
export const env = parsed.data;
export type Env = typeof env;
```

O arquivo é **`src/env.ts`** (não `src/lib/env.ts`). Usa `safeParse` + log dos erros antes de lançar. Não há `VITE_COGNITO_DOMAIN` nem `VITE_APP_VERSION` — os nomes corretos são `VITE_COGNITO_USER_POOL_ID`/`_CLIENT_ID`/`_REGION`, `VITE_COOKIE_DOMAIN` e `VITE_HUB_URL`.

**`SENTRY_AUTH_TOKEN` (alvo):** se adotar upload de sourcemaps, ele não tem prefixo `VITE_`, **não vai pro bundle final**, e fica no Secrets Manager (token sensível) — não em SSM.

**Não use** runtime config (`config.js` carregado via `<script>`) — é antipattern em SPAs modernas e quebra type-safety.

**Se precisar do mesmo build para staging e prod** (mesmo bundle, mudando só env): adicione um `/config.json` servido pelo S3 e fetch no boot. Trade-off: extra request. Não recomendado para esta arquitetura.

---

## 6. Rollback

Bucket está versionado. Para rollback rápido:

```bash
# Lista versões
aws s3api list-object-versions --bucket web-b2b-reservas-prod --prefix index.html

# Restore versão anterior
aws s3api copy-object \
  --copy-source "web-b2b-reservas-prod/index.html?versionId=ABC123" \
  --bucket web-b2b-reservas-prod \
  --key index.html

# Invalida
aws cloudfront create-invalidation --distribution-id E123 --paths "/index.html" "/"
```

Para rollback de muitos arquivos, mais simples:
```bash
# Refaz deploy do commit anterior via pipeline (gatilha rebuild)
git revert HEAD
git push origin main
```

Pipeline detecta, builda, deploya. Mais lento (~10 min) mas mais limpo.

---

## 7. Domain + cert

```
b2b-reservas.com           → site marketing (fora do escopo)
app.b2b-reservas.com       → frontend prod
app.staging.b2b-reservas.com → frontend staging
api.b2b-reservas.com       → backend prod
api.staging.b2b-reservas.com → backend staging
```

ACM cert deve estar em **us-east-1** (CloudFront só aceita lá). Backend ALB pode ter cert na região do backend.

---

## 8. Monitoring pós-deploy

- **CloudFront standard logs** (já configurado no Stack) — análise via Athena.
- **CloudFront real-time logs** (opcional, mais caro) — debug ao vivo.
- **CloudWatch RUM** — Core Web Vitals e erros JS em produção.
- **Synthetic monitoring** — Lambda+Playwright corre fluxo crítico a cada 5 min, alerta SNS se falhar.

---

## 9. Custos estimados (referência, sa-east-1)

| Item | Mensal aprox |
|---|---|
| S3 (10GB + requests baixos) | ~$0.30 |
| CloudFront (100GB out, PRICE_CLASS_100) | ~$8 |
| Route53 hosted zone | $0.50 |
| ACM certificate | grátis |
| CodePipeline | $1/active pipeline |
| CodeBuild (10min build/dia) | ~$5 |
| **Total estimado** | **~$15-20** |

Hospedar SPA na AWS é **muito** barato. O custo vem do tráfego pesado (vídeos, imagens grandes) ou de pipelines superativos.

---

## 10. Checklist deploy

- [ ] CDK stack criada para staging e prod (separadas)
- [ ] ACM cert em us-east-1 cobrindo domínio
- [ ] SSM params para todas as `VITE_*` vars (incluindo `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`)
- [ ] `SENTRY_AUTH_TOKEN` no Secrets Manager (não SSM)
- [ ] OPENAPI_URL no SSM apontando para staging (no pipeline staging) e prod (no pipeline prod)
- [ ] Backend publica `openapi.json` em S3 (opção B do §4.3) — recomendado
- [ ] Bucket privado + OAC + sem ACLs públicas
- [ ] SPA fallback 403/404 → index.html configurado
- [ ] Cache: assets `immutable`, index.html `no-cache`
- [ ] CSP, HSTS, X-Frame-Options no Response Headers Policy
- [ ] CSP `connect-src` inclui `*.sentry.io` e `*.posthog.com`
- [ ] Pipeline com approval manual em prod
- [ ] Smoke test pós-deploy (Lighthouse ou curl simples)
- [ ] Bucket versionado para rollback
- [ ] Sourcemaps fazem upload pro Sentry no build, são deletados antes do deploy
- [ ] Release no Sentry usa git SHA (`VITE_APP_VERSION`)
