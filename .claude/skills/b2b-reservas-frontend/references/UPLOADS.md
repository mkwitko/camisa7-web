# UPLOADS.md — Upload de Arquivos

> Backend gera **presigned URLs** do S3 (gateway já existe). Frontend valida → pede URL → faz PUT direto pro S3 → notifica backend da conclusão. Sem proxiar bytes pela API. Foco em UX (progress, cancel, retry) e robustez (CORS, content-type, race conditions).

> ⚠️ **Estado atual do repo: upload NÃO implementado.** Este doc descreve o **padrão-alvo**. Hoje existe apenas um stub de UI — `src/components/rfp-form/rfp-form-file-dropzone.tsx` (um botão + textos de hint, **sem `<input type=file>`, sem upload, sem presign**). Não há `src/lib/uploads/`, nem hook `useFileUpload`, nem endpoints de upload no `api.json` (o client só conhece `rfp`, `users` e `health`). O client de fetch (`src/api/client.ts`) **já suporta `FormData`** (não seta `Content-Type` nesse caso), então a base pra uploads existe. Ao implementar, siga este doc e crie `src/lib/uploads/`.

---

## 1. Fluxo end-to-end

```
[1] Usuário escolhe arquivo (<input type=file>)
        ↓
[2] Frontend valida: tipo MIME, tamanho, extensão, dimensão (se imagem)
        ↓
[3] Frontend pede URL: POST /v1/uploads/presign { filename, contentType, size }
        ↓
[4] Backend valida limites + gera URL: { url, key, expiresAt, fields }
        ↓
[5] Frontend faz PUT direto no S3, com progress + AbortController
        ↓
[6] Frontend notifica backend: POST /v1/<recurso>/<id>/attachments { key, ... }
        ↓
[7] Backend valida que o objeto existe (HeadObject), salva no DB, retorna entidade
```

**Por que dois passos no backend (presign + notify) e não um só:**
- Presign apenas autoriza o upload. Nada existe no DB ainda.
- Após upload, o backend confirma que o objeto existe (e tem o size/etag certo) antes de criar a entidade.
- Se o cliente desistir entre `[5]` e `[6]`, o S3 fica com órfão — um lifecycle policy do S3 limpa o prefixo `uploads/pending/` depois de 24h. Backend lida com isso.

**Por que PUT direto no S3 (não proxy pela API):**
- API não consome RAM nem CPU com bytes grandes.
- Upload aproveita banda do S3 (multi-region edges).
- Permite arquivos grandes (até 5GB single PUT, 5TB multipart) sem limites do ALB.

---

## 2. Validação no frontend

**Regra:** valide **tudo** no frontend pra UX (feedback imediato) **e** confie que o backend revalida (segurança).

### 2.1 Constraints centralizados

```ts
// src/lib/uploads/constraints.ts
export const UPLOAD_LIMITS = {
  avatar: {
    maxBytes: 2 * 1024 * 1024,           // 2 MB
    accept: ["image/jpeg", "image/png", "image/webp"],
    maxWidth: 4096,
    maxHeight: 4096,
  },
  bookingAttachment: {
    maxBytes: 20 * 1024 * 1024,          // 20 MB
    accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  },
  document: {
    maxBytes: 50 * 1024 * 1024,
    accept: ["application/pdf", "image/jpeg", "image/png"],
  },
} as const satisfies Record<string, UploadConstraint>;

export type UploadConstraint = {
  maxBytes: number;
  accept: readonly string[];
  maxWidth?: number;
  maxHeight?: number;
};

export type UploadKind = keyof typeof UPLOAD_LIMITS;
```

### 2.2 Função de validação

```ts
// src/lib/uploads/validate.ts
import { UPLOAD_LIMITS, type UploadKind } from "./constraints";

export type ValidationError =
  | { code: "TYPE_NOT_ALLOWED"; expected: readonly string[]; got: string }
  | { code: "TOO_LARGE"; max: number; got: number }
  | { code: "DIMENSIONS_TOO_LARGE"; maxWidth: number; maxHeight: number; got: { w: number; h: number } }
  | { code: "EMPTY_FILE" };

export async function validateUpload(
  file: File,
  kind: UploadKind,
): Promise<ValidationError | null> {
  const c = UPLOAD_LIMITS[kind];

  if (file.size === 0) return { code: "EMPTY_FILE" };

  if (file.size > c.maxBytes) {
    return { code: "TOO_LARGE", max: c.maxBytes, got: file.size };
  }

  if (!c.accept.includes(file.type)) {
    return { code: "TYPE_NOT_ALLOWED", expected: c.accept, got: file.type };
  }

  if (c.maxWidth || c.maxHeight) {
    const dims = await readImageDimensions(file);
    if (dims && (dims.w > (c.maxWidth ?? Infinity) || dims.h > (c.maxHeight ?? Infinity))) {
      return {
        code: "DIMENSIONS_TOO_LARGE",
        maxWidth: c.maxWidth!,
        maxHeight: c.maxHeight!,
        got: dims,
      };
    }
  }

  return null;
}

function readImageDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
```

**Mensagens de erro:** mapeie `ValidationError.code` para chave i18n. Sem `throw`/`Error` aqui — retornamos o tipo pra forçar tratamento explícito.

### 2.3 Validação na UI

```tsx
// no handler do <input>
const error = await validateUpload(file, "bookingAttachment");
if (error) {
  toast.error(t(`uploads.errors.${error.code}`, {
    max: formatBytes(error.code === "TOO_LARGE" ? error.max : 0),
  }));
  return;
}
```

**Não confie no `accept` do `<input type=file>`** — usuário pode burlar (e mesmo o navegador sugere "Any file" em macOS). É só dica de UX.

---

## 3. Hook `useFileUpload`

Encapsula presign + PUT + notify, com progress, cancel e retry. **Hook único** consumido por todas as features (avatar, anexo de reserva, documento).

### 3.1 Tipos de retorno

```ts
// src/lib/uploads/types.ts
export type UploadState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "presigning" }
  | { status: "uploading"; progress: number; loaded: number; total: number }
  | { status: "notifying" }
  | { status: "success"; key: string; entity: unknown }
  | { status: "error"; error: UploadError };

export type UploadError =
  | { kind: "validation"; detail: ValidationError }
  | { kind: "presign_failed"; cause: ApiError }
  | { kind: "upload_failed"; status?: number; cause?: unknown }
  | { kind: "notify_failed"; cause: ApiError }
  | { kind: "canceled" }
  | { kind: "timeout" };
```

### 3.2 Implementação

```ts
// src/lib/uploads/use-file-upload.ts
import { useCallback, useRef, useState } from "react";
import { usePresignUpload } from "@/api/generated/hooks/uploadsHooks/usePresignUpload"; // quando o endpoint existir
import { validateUpload } from "./validate";
import type { UploadKind } from "./constraints";
import type { UploadState } from "./types";

type Options = {
  kind: UploadKind;
  notify: (params: { key: string; size: number; contentType: string }) => Promise<unknown>;
  onSuccess?: (entity: unknown) => void;
  onError?: (error: UploadState & { status: "error" }) => void;
};

export function useFileUpload(opts: Options) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const { mutateAsync: presign } = useUploadsPresign();

  const upload = useCallback(async (file: File) => {
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      // 1. Validate
      setState({ status: "validating" });
      const validation = await validateUpload(file, opts.kind);
      if (validation) {
        const err = { status: "error" as const, error: { kind: "validation" as const, detail: validation } };
        setState(err);
        opts.onError?.(err);
        return;
      }
      if (signal.aborted) throw new DOMException("canceled", "AbortError");

      // 2. Presign
      setState({ status: "presigning" });
      const presigned = await presign({
        data: { filename: file.name, contentType: file.type, size: file.size, kind: opts.kind },
      });
      if (signal.aborted) throw new DOMException("canceled", "AbortError");

      // 3. PUT to S3 — XHR (fetch ainda não tem progress upload)
      await putToS3({
        url: presigned.url,
        file,
        signal,
        onProgress: (loaded, total) => {
          setState({
            status: "uploading",
            progress: total > 0 ? loaded / total : 0,
            loaded,
            total,
          });
        },
      });
      if (signal.aborted) throw new DOMException("canceled", "AbortError");

      // 4. Notify backend
      setState({ status: "notifying" });
      const entity = await opts.notify({
        key: presigned.key,
        size: file.size,
        contentType: file.type,
      });

      setState({ status: "success", key: presigned.key, entity });
      opts.onSuccess?.(entity);
    } catch (err) {
      const errorState = toErrorState(err);
      setState(errorState);
      opts.onError?.(errorState);
    } finally {
      abortRef.current = null;
    }
  }, [opts, presign]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, upload, cancel, reset };
}

function toErrorState(err: unknown): UploadState & { status: "error" } {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { status: "error", error: { kind: "canceled" } };
  }
  // ... mapeia ApiError de presign/notify para presign_failed/notify_failed
  return { status: "error", error: { kind: "upload_failed", cause: err } };
}
```

### 3.3 PUT pro S3 — XHR (não fetch)

`fetch` ainda não tem progresso de upload em maio/2026 (RFC existe, implementação parcial). XHR é padrão estabelecido.

```ts
// src/lib/uploads/put-to-s3.ts
type Args = {
  url: string;
  file: File;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
};

export function putToS3({ url, file, signal, onProgress }: Args): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("canceled", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Importante: Content-Type DEVE bater com o que foi assinado
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 PUT failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during S3 PUT")));
    xhr.addEventListener("timeout", () => reject(new DOMException("timeout", "TimeoutError")));

    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.addEventListener("loadend", () => signal.removeEventListener("abort", onAbort));

    // Timeout generoso pra arquivos grandes em conexão ruim (5 min)
    xhr.timeout = 5 * 60_000;

    xhr.send(file);
  });
}
```

---

## 4. CORS do bucket — armadilha clássica

Para PUT direto no S3 funcionar do navegador, o **bucket precisa de CORS configurado** permitindo:

```json
[
  {
    "AllowedOrigins": ["https://app.b2b-reservas.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600,
    "ExposeHeaders": ["ETag"]
  }
]
```

CDK do bucket (backend infra):

```ts
bucket.addCorsRule({
  allowedOrigins: ["https://app.b2b-reservas.com", "http://localhost:5173"],
  allowedMethods: [HttpMethods.PUT],
  allowedHeaders: ["Content-Type", "Content-Length"],
  exposedHeaders: ["ETag"],
  maxAge: 3600,
});
```

**Sintomas de CORS errado:**
- DevTools: erro "blocked by CORS policy" no PUT
- Network tab: preflight `OPTIONS` retornando 403
- `xhr.status` chega como 0

**Solução:** verifique que (a) o origin do app está em `AllowedOrigins`, (b) `Content-Type` está em `AllowedHeaders`, (c) o bucket de fato tem CORS aplicado (não confunda com bucket policy).

---

## 5. Content-Type — o detalhe que sempre erra

O presigned URL é assinado **com o Content-Type específico**. Se o frontend mandar `Content-Type` diferente do que foi enviado no `POST /presign`, o S3 rejeita com 403 SignatureDoesNotMatch.

**Regras:**
- O frontend manda `file.type` no presign body.
- O frontend manda o mesmo `file.type` no `xhr.setRequestHeader("Content-Type", ...)` do PUT.
- Backend assina o presign com o `contentType` recebido.

**Casos problemáticos:**
- `file.type` vazio (alguns formatos exóticos, drag-and-drop em Safari antigo): backend deve aceitar `application/octet-stream` como fallback.
- Usuário renomeia `.pdf` pra `.jpg`: `file.type` reflete o conteúdo (browsers detectam pelo conteúdo na maioria dos casos), mas pode mentir. Backend valida via magic numbers ou usa `HeadObject` no S3 pra inspecionar.

---

## 6. Componente `<FileDropzone>`

Componente shadcn-style reutilizável.

```tsx
// src/components/shared/FileDropzone.tsx
import { Upload, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileUpload } from "@/lib/uploads/use-file-upload";
import type { UploadKind } from "@/lib/uploads/constraints";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Props = {
  kind: UploadKind;
  notify: (params: { key: string; size: number; contentType: string }) => Promise<unknown>;
  onSuccess?: (entity: unknown) => void;
  className?: string;
  label?: string;
};

export function FileDropzone({ kind, notify, onSuccess, className, label }: Props) {
  const { t } = useTranslation(["common", "uploads"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { state, upload, cancel, reset } = useFileUpload({ kind, notify, onSuccess });

  const onPick = () => inputRef.current?.click();
  const onFile = (file: File | undefined) => file && upload(file);

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragging && "border-primary bg-primary/5",
        state.status === "error" && "border-destructive",
        className,
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {state.status === "idle" || state.status === "validating" || state.status === "presigning" ? (
        <div className="space-y-2">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">{label ?? t("uploads:dropzone.prompt")}</p>
          <Button type="button" variant="outline" onClick={onPick}>
            {t("uploads:dropzone.choose")}
          </Button>
        </div>
      ) : null}

      {state.status === "uploading" || state.status === "notifying" ? (
        <div className="space-y-3">
          <Progress value={state.status === "uploading" ? state.progress * 100 : 100} />
          <div className="flex items-center justify-between text-sm">
            <span>
              {state.status === "uploading"
                ? `${Math.round(state.progress * 100)}% — ${formatBytes(state.loaded)} / ${formatBytes(state.total)}`
                : t("uploads:state.finalizing")}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={cancel} aria-label={t("common:actions.cancel")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "success" ? (
        <div className="space-y-2 text-sm">
          <CheckCircle2 className="mx-auto h-6 w-6 text-green-600" aria-hidden />
          <p>{t("uploads:state.success")}</p>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {t("uploads:actions.replace")}
          </Button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="space-y-2 text-sm">
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" aria-hidden />
          <p>{errorMessage(state.error, t)}</p>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            {t("common:actions.tryAgain")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(err: UploadError, t: (k: string, p?: object) => string): string {
  switch (err.kind) {
    case "validation":
      return t(`uploads:errors.${err.detail.code}`, { ...err.detail });
    case "canceled":   return t("uploads:errors.canceled");
    case "timeout":    return t("uploads:errors.timeout");
    case "presign_failed":
    case "notify_failed":
    case "upload_failed":
    default:           return t("uploads:errors.generic");
  }
}
```

---

## 7. Múltiplos arquivos / upload em lote

Para anexar várias fotos a uma reserva, **não use um único `useFileUpload` em loop** — paralelize com limite de concorrência.

```ts
// src/lib/uploads/use-multi-upload.ts
const CONCURRENCY = 3;

export function useMultiUpload(opts: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const uploadAll = async (files: File[]) => {
    const queue = files.map((file, idx) => ({ id: crypto.randomUUID(), file, idx }));
    setItems(queue.map((q) => ({ id: q.id, name: q.file.name, status: "idle" })));

    // Pool de workers
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        await uploadOne(item, /* ... */); // atualiza items[item.id] em cada estado
      }
    });

    await Promise.all(workers);
  };

  // ...
}
```

Concorrência alta = travas de banda + risco de hit em rate limit do presign. **3-5 é seguro.**

---

## 8. Retry em uploads parciais (avançado, opcional)

Para arquivos grandes (>50 MB) em conexão instável, considere **multipart upload**:

- Backend retorna múltiplas presigned URLs (1 por chunk).
- Frontend faz PUT de cada chunk com retry independente.
- Backend finaliza com `CompleteMultipartUpload` quando todos completam.

**Complexidade:** alta. **Quando usar:** apenas se houver upload regular de arquivos > 50 MB. Para reservas (PDF, fotos), single PUT cobre. Não documente até precisar.

Lib `evaporate.js` resolve, mas tem 6 anos. Implementação artesanal é viável mas demorada.

---

## 9. Preview antes/durante/depois do upload

```tsx
// Antes (do arquivo escolhido, ainda não subido)
const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
{previewUrl && file?.type.startsWith("image/") && <img src={previewUrl} alt="" />}

// Depois (entidade no backend já tem URL ou key)
{attachment && <img src={`/api/files/${attachment.key}`} alt={attachment.name} />}
```

**Não esqueça do `URL.revokeObjectURL`** — ObjectURLs ficam em memória até a aba fechar. Em listas grandes, vaza fácil.

Para imagens grandes, use `<img loading="lazy" width={...} height={...}>` (ver [`PERFORMANCE.md`](./PERFORMANCE.md) sobre CLS).

---

## 10. Segurança — o que validar no backend

Mesmo o frontend validando, o backend **revalida tudo**:

| Check | Por quê |
|---|---|
| Size do objeto no S3 = size do presign | Cliente pode mandar arquivo maior que o assinado (gera 403 do S3, mas confirme) |
| Content-Type via magic numbers (ou `HeadObject`) | Extensão/`file.type` mentem |
| Owner: usuário autenticado pode acessar a reserva | Atacante chuta IDs |
| Quota por usuário/tenant | Evita spam de uploads |
| Vírus scan (opcional, depende do domínio) | S3 + Lambda + ClamAV para anexos públicos |

Frontend **não precisa** se preocupar com isso — backend reject = `notify_failed`, UX já tratada.

---

## 11. i18n — chaves padrão

```json
// public/locales/pt-BR/uploads.json
{
  "dropzone": {
    "prompt": "Arraste um arquivo ou clique para escolher",
    "choose": "Escolher arquivo"
  },
  "state": {
    "validating": "Validando…",
    "uploading": "Enviando…",
    "finalizing": "Finalizando…",
    "success": "Enviado com sucesso"
  },
  "actions": {
    "replace": "Substituir"
  },
  "errors": {
    "TYPE_NOT_ALLOWED": "Tipo de arquivo não permitido",
    "TOO_LARGE": "Arquivo muito grande (máximo {{max}})",
    "DIMENSIONS_TOO_LARGE": "Imagem muito grande (máximo {{maxWidth}}x{{maxHeight}})",
    "EMPTY_FILE": "Arquivo vazio",
    "canceled": "Envio cancelado",
    "timeout": "Tempo esgotado. Tente novamente.",
    "generic": "Não foi possível enviar. Tente novamente."
  }
}
```

---

## 12. Testes

### 12.1 Validação

```ts
test("rejects file over size limit", async () => {
  const file = new File(["x".repeat(3 * 1024 * 1024)], "big.png", { type: "image/png" });
  const err = await validateUpload(file, "avatar"); // 2MB limit
  expect(err?.code).toBe("TOO_LARGE");
});

test("rejects disallowed mime", async () => {
  const file = new File(["..."], "doc.exe", { type: "application/x-msdownload" });
  const err = await validateUpload(file, "bookingAttachment");
  expect(err?.code).toBe("TYPE_NOT_ALLOWED");
});
```

### 12.2 Upload completo com MSW

```ts
import { server } from "@/test/mocks/server";
import { http, HttpResponse } from "msw";

test("happy path", async () => {
  server.use(
    http.post("*/v1/uploads/presign", () =>
      HttpResponse.json({ url: "https://fake.s3/put", key: "uploads/abc.png", expiresAt: "..." }),
    ),
    http.put("https://fake.s3/put", () => new HttpResponse(null, { status: 200 })),
    http.post("*/v1/bookings/:id/attachments", () =>
      HttpResponse.json({ id: "att_1", key: "uploads/abc.png" }),
    ),
  );

  renderWithProviders(<MyFormUsingDropzone />);

  const file = new File(["..."], "photo.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText(/escolher arquivo/i), file);

  expect(await screen.findByText(/enviado com sucesso/i)).toBeInTheDocument();
});
```

### 12.3 Cancel

```ts
test("cancels mid-upload", async () => {
  // server.use(...) com handler que delaya a resposta do PUT

  renderWithProviders(<MyFormUsingDropzone />);
  await userEvent.upload(/* file */);

  // espera começar upload
  await screen.findByText(/enviando/i);

  await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

  expect(await screen.findByText(/envio cancelado/i)).toBeInTheDocument();
});
```

XHR não dá pra mockar nativamente em jsdom — MSW v2 intercepta `fetch` mas para XHR também precisa do `xhr-mock` ou usar `msw`'s XHR support. Alternativa: testar `putToS3` isoladamente com `xhr-mock` e testar `useFileUpload` com `putToS3` mockado via `vi.mock`.

---

## 13. Checklist de upload

- [ ] Validação client-side antes do presign (size, mime, dimensão)
- [ ] Mesma constraint replicada no backend (revalidação)
- [ ] Content-Type idêntico em presign body e PUT header
- [ ] Bucket S3 com CORS configurado pro domínio do app
- [ ] AbortController plugado em XHR + signal propagado
- [ ] Progress visível (Progress component) para arquivos > 1 MB
- [ ] Botão de cancel acessível durante upload
- [ ] Botão de retry após erro
- [ ] `URL.revokeObjectURL` em cleanup de previews
- [ ] Toast/feedback em erro com mensagem útil (não "erro genérico")
- [ ] i18n keys em `uploads.json`
- [ ] Lifecycle policy no S3 limpa `uploads/pending/` após 24h (responsabilidade do backend)
- [ ] Teste cobre: happy path, validação falha, S3 falha, cancel, retry
