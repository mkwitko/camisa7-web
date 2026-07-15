# FORMS.md — React Hook Form + Zod

> Formulários performáticos (uncontrolled), validação tipada com Zod, integração com componentes shadcn. Padrão único para todos os forms.

> ⚠️ **Estado atual do repo.** Este é o **padrão-alvo**. As deps (`react-hook-form`, `@hookform/resolvers`, `zod`) e o scaffolding (`src/components/ui/form.tsx`, `src/components/ui/form-message-i18n.tsx`, namespace `zod.json`) já existem, mas **o wizard atual em `src/components/rfp-form/` usa `useState` puro** e ainda não adotou RHF+Zod. Não há diretório `src/schemas/` ainda, e o `FormMessageI18n` está definido mas não é importado por ninguém. Ao construir o próximo form de verdade, siga este doc e crie `src/schemas/<modulo>/`.

---

## 1. Stack

- **React Hook Form** — gerencia estado do form via refs (uncontrolled). Re-renders mínimos.
- **Zod** — schema de validação. **Mensagens via i18n keys**, nunca hardcoded.
- **`@hookform/resolvers/zod`** — ponte entre Zod e RHF.
- **shadcn `<Form>` components** — wrappers que conectam RHF + UI primitives (Input, Select).

```bash
pnpm add react-hook-form zod @hookform/resolvers
pnpm dlx shadcn@latest add form input label select textarea
```

> Detalhes do setup de i18n: [`I18N.md`](./I18N.md). O `zod-i18n-map` (mensagens padrão do Zod traduzidas) **ainda não está instalado/wired** — quando adotar Zod nos forms, instale-o e chame `z.setErrorMap`. Esta página foca em **forms** especificamente.

---

## 2. Anatomia de um form completo

Vamos construir um form de criar usuário, do schema ao componente.

### 2.1 Schema Zod

```ts
// src/schemas/users/create-user.schema.ts
import { z } from "zod";

// Mensagens via chave i18n — sem string hardcoded.
// As chaves abaixo correspondem a `public/locales/<lng>/users.json`:
//   form.errors.name.required, form.errors.name.tooLong, etc.
export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, { message: "users:form.errors.name.required" })
    .max(120, { message: "users:form.errors.name.tooLong" }),
  email: z
    .string()
    .min(1, { message: "users:form.errors.email.required" })
    .email({ message: "users:form.errors.email.invalid" })
    .max(255, { message: "users:form.errors.email.tooLong" }),
  role: z.enum(["admin", "user", "viewer"], {
    errorMap: () => ({ message: "users:form.errors.role.required" }),
  }),
  bio: z.string().max(500, { message: "users:form.errors.bio.tooLong" }).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

**Princípios:**
- Mensagens são **chaves i18n** (formato `<namespace>:<chave>`), não strings localizadas. A tradução acontece no render do `<FormMessage>` que faz `t(field.error.message)` automaticamente — ver § 2.2.
- `errorMap` para enums (default da lib fica feio).
- Schema fica em `src/schemas/<modulo>/`, organizado por módulo.
- Type derivado: `z.infer<typeof schema>`.

`public/locales/pt-BR/users.json`:

```json
{
  "form": {
    "fields": {
      "name": "Nome",
      "email": "E-mail",
      "role": "Papel",
      "bio": "Biografia"
    },
    "errors": {
      "name":  { "required": "Nome é obrigatório", "tooLong": "Nome muito longo" },
      "email": { "required": "E-mail é obrigatório", "invalid": "E-mail inválido", "tooLong": "E-mail muito longo" },
      "role":  { "required": "Selecione um papel" },
      "bio":   { "tooLong": "Máximo 500 caracteres" }
    }
  }
}
```

Mensagens de erros padrão do Zod (`required`, `email`, `min`, `max` genéricos) saem do `zod-i18n-map` automaticamente — você não precisa duplicar essas chaves em cada módulo. Customize apenas o que tem semântica de domínio. Ver [`I18N.md`](./I18N.md).

### 2.2 Componente do form — traduz `field.error.message`

O `<FormMessage>` do shadcn renderiza `field.error.message` direto. Como nossa mensagem é uma **chave i18n**, precisamos traduzir antes de exibir. Padronizamos via wrapper:

```tsx
// src/components/ui/form-message-i18n.tsx
import { useFormField } from "@/components/ui/form";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

export const FormMessageI18n = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { t } = useTranslation();
    const { error, formMessageId } = useFormField();
    const body = error?.message
      // Se a "message" parecer com uma chave i18n (`namespace:caminho`), traduz
      ? typeof error.message === "string" && error.message.includes(":")
        ? t(error.message)
        : String(error.message)
      : children;

    if (!body) return null;
    return (
      <p ref={ref} id={formMessageId} className={cn("text-sm font-medium text-destructive", className)} {...props}>
        {body}
      </p>
    );
  },
);
FormMessageI18n.displayName = "FormMessageI18n";
```

Use `<FormMessageI18n />` em vez de `<FormMessage />` nos forms.

```tsx
// src/components/users/user-form.tsx
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { FormMessageI18n } from "@/components/ui/form-message-i18n";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createUserSchema, type CreateUserInput } from "@/schemas/users/create-user.schema";

type Props = {
  defaultValues?: Partial<CreateUserInput>;
  onSubmit: (values: CreateUserInput) => Promise<void> | void;
  isSubmitting?: boolean;
};

export function UserForm({ defaultValues, onSubmit, isSubmitting }: Props) {
  const { t } = useTranslation(["users", "common"]);
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "user",
      bio: "",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users:form.fields.name")}</FormLabel>
              <FormControl>
                <Input placeholder={t("users:form.placeholders.name")} {...field} />
              </FormControl>
              <FormMessageI18n />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users:form.fields.email")}</FormLabel>
              <FormControl>
                <Input type="email" placeholder={t("users:form.placeholders.email")} autoComplete="email" {...field} />
              </FormControl>
              <FormDescription>{t("users:form.descriptions.email")}</FormDescription>
              <FormMessageI18n />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users:form.fields.role")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="admin">{t("users:roles.admin")}</SelectItem>
                  <SelectItem value="user">{t("users:roles.user")}</SelectItem>
                  <SelectItem value="viewer">{t("users:roles.viewer")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessageI18n />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("users:form.fields.bio")}</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessageI18n />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            {t("common:actions.reset")}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("common:states.saving") : t("common:actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

### 2.3 Página que monta o form + mutation

```tsx
// src/routes/users/new/index.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCreateUser } from "@/api/generated/hooks/usersHooks/useCreateUser";
import { UserForm } from "@/components/users/user-form";
import { AppHeader } from "@/components/layout/app-header";
import { requireAuth } from "@/lib/router/guards";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { USERS } from "@/api/modules";

export const Route = createFileRoute("/users/new/")({
  beforeLoad: requireAuth,
  component: NewUserPage,
});

function NewUserPage() {
  const { t } = useTranslation("users");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useCreateUser({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS.queryKeyRoot });
      toast.success(t("feedback.created"));
      navigate({ to: "/users" });
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao criar usuário");
    },
  });

  return (
    <>
      <AppHeader title="Novo usuário" />
      <div className="mx-auto max-w-2xl">
        <UserForm
          isSubmitting={isPending}
          onSubmit={async (data) => {
            await mutateAsync({ data });
          }}
        />
      </div>
    </>
  );
}
```

---

## 3. Estratégias de validação

### 3.1 Quando validar

RHF default: `onSubmit` (valida ao submeter). Para feedback mais rápido:

```ts
useForm({
  resolver: zodResolver(schema),
  mode: "onBlur",         // valida ao sair do campo
  reValidateMode: "onChange", // após primeiro erro, valida a cada mudança
});
```

**Recomendação:** `onBlur` + `reValidateMode: "onChange"`. Equilibra UX (sem spammar erros enquanto digita) com rapidez de feedback.

### 3.2 Validações cruzadas (campos dependentes)

```ts
const schema = z.object({
  password: z.string().min(8),
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Senhas não coincidem",
  path: ["passwordConfirm"],
});
```

### 3.3 Validação assíncrona (e-mail único, etc)

Para validações que requerem API call, use `mode: "onBlur"` + lógica no resolver:

```ts
const schema = z.object({
  email: z.string().email(),
}).superRefine(async (data, ctx) => {
  const exists = await checkEmailExists(data.email);
  if (exists) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "E-mail já cadastrado",
      path: ["email"],
    });
  }
});
```

> Debounce e cache se for chamar API a cada blur. Considere fazer a validação **só no submit** se o feedback "live" não compensar o request extra.

---

## 4. Reaproveitando schema para criar/editar

```ts
// schemas/user.schema.ts
const baseUser = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  role: z.enum(["admin", "user", "viewer"]),
});

export const createUserSchema = baseUser.extend({
  password: z.string().min(8),
});

export const updateUserSchema = baseUser.partial(); // tudo opcional para PATCH
```

---

## 5. Tipos compartilhados com schema do backend (Kubb)

> ⚠️ **O Kubb deste repo NÃO gera schemas Zod** — o `kubb.config.ts` não inclui `pluginZod` (ver [`KUBB.md`](./KUBB.md)). Logo **não existe** `src/api/generated/zod/`. Você sempre escreve seus próprios schemas Zod do form em `src/schemas/<modulo>/`.

Os **types** do Kubb (de `pluginTs`) ainda ajudam: use-os para tipar o payload da mutation. Mas a validação do form é um schema Zod escrito à mão:

```ts
import type { CreateUserMutationRequest } from "@/api/generated/types/CreateUser";
import { z } from "zod";

// Schema do FORM (o que o usuário digita) — escrito à mão, mensagens via i18n.
export const createUserSchema = z.object({ /* ... */ }) satisfies z.ZodType<Partial<CreateUserMutationRequest>>;
```

**Regra:** o schema do form é definido pelo que o **usuário** insere; o type do Kubb é definido pelo que a **API** aceita. Eles raramente são idênticos (campos UI-only como `passwordConfirm`/`acceptTerms`, mensagens em pt-BR, múltiplos endpoints).

---

## 6. Padrões comuns

### 6.1 Field array (lista dinâmica de itens)

```tsx
import { useFieldArray } from "react-hook-form";

const schema = z.object({
  guests: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })).min(1, "Adicione ao menos 1 convidado"),
});

function GuestsField() {
  const { control } = useFormContext<z.infer<typeof schema>>();
  const { fields, append, remove } = useFieldArray({ control, name: "guests" });

  return (
    <div>
      {fields.map((field, index) => (
        <div key={field.id} className="flex gap-2">
          <FormField
            control={control}
            name={`guests.${index}.name`}
            render={({ field }) => (
              <FormItem>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* ... email ... */}
          <Button type="button" variant="ghost" onClick={() => remove(index)}>
            Remover
          </Button>
        </div>
      ))}
      <Button type="button" onClick={() => append({ name: "", email: "" })}>
        Adicionar convidado
      </Button>
    </div>
  );
}
```

### 6.2 Watch — derivar UI de valores

```tsx
const watchRole = form.watch("role");

{watchRole === "admin" && (
  <FormField name="adminScope" /* ... */ />
)}
```

> **Uso moderado:** cada `watch` força re-render. Para muitos campos derivados, use `useWatch` específico ou subscriba estrategicamente.

### 6.3 Reset após sucesso

```tsx
const { mutate } = useCreateUser({
  onSuccess: () => {
    form.reset();
    toast.success("Criado");
  },
});
```

### 6.4 Mostrar erro de API mapeado em campos

Backend retorna `{ error: { code: "EMAIL_TAKEN", field: "email", message: "..." } }`:

```tsx
const { mutateAsync } = useCreateUser({
  onError: (err) => {
    if (err.code === "EMAIL_TAKEN") {
      form.setError("email", { message: err.message });
    } else {
      toast.error(err.message);
    }
  },
});
```

---

## 7. Acessibilidade em forms

shadcn `<Form>` components cuidam de:
- `<label htmlFor>` ligado ao `<input id>`
- `aria-describedby` apontando para Description + ErrorMessage
- `aria-invalid` quando erro
- `aria-required` quando obrigatório

**Sua parte:**
- `autoComplete` correto (`email`, `current-password`, `new-password`, `tel`, `address-level1`, etc) — preenchimento automático, gerenciadores de senha.
- `inputMode` para mobile (`numeric`, `decimal`, `tel`).
- `type` correto (`email`, `tel`, `url`, `number`, `password`).
- Erros próximos do campo (Form components cuidam).
- Ordem dos campos lógica (Tab funciona).
- Submit no Enter (default `<form>`).
- **Não esconda labels** ("placeholder como label" é antipattern).

---

## 8. Performance

RHF é uncontrolled — não re-renderiza a árvore inteira a cada keypress. Mas há armadilhas:

### 8.1 Não use `watch()` no topo

```tsx
// ❌ re-renderiza todo o form a cada keypress
const allValues = form.watch();

// ✅ subscreve só ao que precisa
const role = form.watch("role");
```

### 8.2 `Controller` para componentes não-nativos

Componentes que não aceitam ref padrão (Select de bibliotecas, etc) precisam de Controller. shadcn `FormField` já usa Controller internamente.

### 8.3 Forms grandes

Para forms com > 30 campos, considere:
- Quebrar em steps (wizard).
- Schema por step + merge no final.
- Lazy load de componentes pesados.

---

## 9. Testes

```tsx
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { UserForm } from "./UserForm";

test("validates email", async () => {
  const onSubmit = vi.fn();
  render(<UserForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText("E-mail"), "invalido");
  await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

  expect(await screen.findByText("E-mail inválido")).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("submits valid data", async () => {
  const onSubmit = vi.fn();
  render(<UserForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText("Nome"), "Alice");
  await userEvent.type(screen.getByLabelText("E-mail"), "a@b.com");
  await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Alice",
      email: "a@b.com",
      role: "user",
      bio: "",
    });
  });
});
```

Veja [`TESTING.md`](./TESTING.md) para o padrão completo.

---

## 10. Checklist de form

- [ ] Schema Zod em `src/schemas/<modulo>/`
- [ ] Mensagens de erro em português
- [ ] `zodResolver` no `useForm`
- [ ] `mode: "onBlur"` + `reValidateMode: "onChange"`
- [ ] Componentes shadcn `<Form>`, `<FormField>`, `<FormMessage>`
- [ ] `autoComplete` correto em todos os campos
- [ ] `type`/`inputMode` apropriados
- [ ] `disabled` no submit durante mutation
- [ ] Sucesso: toast + invalidate query + navigate
- [ ] Erro: toast + (se campo específico) `form.setError`
- [ ] Reset após sucesso quando apropriado
- [ ] Teste cobre validação + submit + erro de API
