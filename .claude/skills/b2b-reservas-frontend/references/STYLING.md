# STYLING.md — shadcn/ui + Tailwind

> shadcn/ui não é uma lib; é um **conjunto de componentes copiados pro seu repo**, baseados em Radix Primitives + Tailwind. Você controla tudo — pode editar livremente. Padrão de mercado em 2024-2026 para apps React profissionais.

---

## 1. Como shadcn funciona (diferente de outras libs)

**MUI/Mantine/Chakra:** você instala via npm, importa, está sob controle do mainainer.

**shadcn/ui:** você roda `pnpm dlx shadcn@latest add button` e o CLI **copia** `button.tsx` para `src/components/ui/button.tsx`. A partir daí, é seu código. Sem versão para atualizar, sem breaking changes, sem black box.

**Vantagens:**
- Customização total.
- Bundle: só o que você usa.
- Acessibilidade via Radix Primitives (compromisso real com WCAG).
- Theming consistente via CSS variables.

**Trade-off:**
- Mais código no repo.
- "Updates" exigem re-add manual (raro; em prática você diverge mesmo).

---

## 2. Setup inicial

### 2.1 Instalar Tailwind v4 + Vite plugin

```bash
pnpm add tailwindcss @tailwindcss/vite
```

Tailwind v4 **não precisa** de PostCSS, autoprefixer ou `tailwind.config.ts`. Configuração inline no CSS.

```ts
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), /* ... */],
});
```

### 2.2 Inicializar shadcn

```bash
pnpm dlx shadcn@latest init
```

CLI pergunta:
- TypeScript? **Yes**
- Style? **Default** ou **New York** (escolha um e mantenha)
- Base color? **Slate** (recomendado)
- CSS variables? **Yes** (essencial para theming)
- Components alias? `@/components`
- Utils alias? `@/lib/utils`

Cria:
- `components.json` — config do CLI
- `src/lib/utils.ts` (com função `cn`)
- `src/styles/globals.css` (já no formato v4)

> shadcn já suporta Tailwind v4 desde dezembro/2024. Geração de componentes usa `@theme inline` automaticamente.

### 2.3 Adicionar componentes conforme necessário

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog form input label
pnpm dlx shadcn@latest add table dropdown-menu
pnpm dlx shadcn@latest add toast sonner
pnpm dlx shadcn@latest add skeleton
```

Cada comando copia componente em `src/components/ui/<name>.tsx` (kebab-case por padrão do CLI). Dependências (Radix, etc.) instaladas automaticamente.

---

## 3. Estrutura de arquivos

```
src/
├── components/
│   ├── ui/                     # shadcn — kebab-case (`button.tsx`)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   └── ...
│   ├── layout/                 # layouts da app
│   ├── shared/                 # compartilhados entre módulos
│   └── <modulo>/               # componentes por módulo (kebab-case)
├── lib/
│   └── utils.ts                # função cn() (clsx + tailwind-merge)
└── styles/
    └── globals.css             # @import "tailwindcss" + @theme

components.json                 # config shadcn
```

**Não há mais `tailwind.config.ts`.** Tudo no CSS.

---

## 4. Configuração — Tailwind v4 (CSS-first)

Toda configuração mora em `src/styles/globals.css`:

```css
/* src/styles/globals.css */
@import "tailwindcss";

/* Suporta dark mode via classe .dark no <html> */
@custom-variant dark (&:where(.dark, .dark *));

/* Cores e tokens do tema — substituem o `theme.extend.colors` da v3 */
@theme {
  --color-background:         hsl(0 0% 100%);
  --color-foreground:         hsl(222.2 84% 4.9%);

  --color-card:               hsl(0 0% 100%);
  --color-card-foreground:    hsl(222.2 84% 4.9%);

  --color-popover:            hsl(0 0% 100%);
  --color-popover-foreground: hsl(222.2 84% 4.9%);

  --color-primary:            hsl(221.2 83.2% 53.3%);
  --color-primary-foreground: hsl(210 40% 98%);

  --color-secondary:            hsl(210 40% 96.1%);
  --color-secondary-foreground: hsl(222.2 47.4% 11.2%);

  --color-muted:              hsl(210 40% 96.1%);
  --color-muted-foreground:   hsl(215.4 16.3% 46.9%);

  --color-accent:             hsl(210 40% 96.1%);
  --color-accent-foreground:  hsl(222.2 47.4% 11.2%);

  --color-destructive:            hsl(0 84.2% 60.2%);
  --color-destructive-foreground: hsl(210 40% 98%);

  --color-border:             hsl(214.3 31.8% 91.4%);
  --color-input:              hsl(214.3 31.8% 91.4%);
  --color-ring:               hsl(221.2 83.2% 53.3%);

  --radius-sm:                calc(var(--radius) - 4px);
  --radius-md:                calc(var(--radius) - 2px);
  --radius-lg:                var(--radius);

  --font-sans:                "Inter Variable", system-ui, sans-serif;

  /* Container e breakpoints (substitui theme.container da v3) */
  --breakpoint-2xl:           1400px;

  /* Animações */
  --animate-accordion-down:   accordion-down 0.2s ease-out;
  --animate-accordion-up:     accordion-up 0.2s ease-out;
}

/* Variáveis "soltas" (não-theme) — usadas via var() em utilitários custom */
:root {
  --radius: 0.5rem;
}

.dark {
  --color-background:         hsl(222.2 84% 4.9%);
  --color-foreground:         hsl(210 40% 98%);

  --color-card:               hsl(222.2 84% 4.9%);
  --color-card-foreground:    hsl(210 40% 98%);

  --color-primary:            hsl(217.2 91.2% 59.8%);
  --color-primary-foreground: hsl(222.2 47.4% 11.2%);

  /* ... resto análogo */
}

/* Keyframes (continua igual à v3) */
@keyframes accordion-down {
  from { height: 0; }
  to   { height: var(--radix-accordion-content-height); }
}
@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to   { height: 0; }
}

/* Estilos base */
@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

**O que mudou da v3:**

| v3 | v4 |
|---|---|
| `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| `tailwind.config.ts` com `theme.extend.colors` | `@theme { --color-foo: ... }` no CSS |
| `darkMode: ["class"]` | `@custom-variant dark (...)` no CSS |
| `content: ["./src/**/*.{ts,tsx}"]` | Detecção automática (sem config) |
| Plugins via `tailwind.config` | `@plugin "..."` no CSS |
| Variáveis "soltas" via `theme.extend.colors: { primary: 'hsl(var(--primary))' }` | `--color-primary: hsl(...)` direto no `@theme` |

**Por que v4:**
- Engine reescrito em Rust (LightningCSS) — 5-10× mais rápido em incremental build.
- CSS-first é mais idiomático (theme tokens viram CSS vars nativas).
- Suporte nativo a OKLCH, container queries, `@starting-style`.
- shadcn segue oficialmente desde dez/2024.

**Customização da marca:** mude os `--color-*` no `@theme`. Tudo se atualiza.

---

## 6. Dark mode

### 6.1 Toggle

shadcn padrão usa classe `.dark` no `<html>`. Implementamos com `next-themes` (funciona em qualquer React, não só Next):

```bash
pnpm add next-themes
```

```tsx
// src/components/theme-provider.tsx
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

```tsx
// src/main.tsx
import { ThemeProvider } from "@/components/theme-provider";

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <RouterProvider router={router} />
</ThemeProvider>
```

### 6.2 Toggle button

```tsx
// src/components/theme-toggle.tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Alternar tema"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

---

## 7. A função `cn` — combinando classes

`src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**O que faz:** combina conditionals (via `clsx`) e resolve conflitos do Tailwind (via `tailwind-merge`). `cn("p-4", "p-2")` → `"p-2"` (último vence).

**Uso:**

```tsx
<div
  className={cn(
    "rounded border p-4",
    isActive && "border-primary bg-primary/10",
    className, // override do consumer
  )}
/>
```

**Sempre use `cn`** em vez de template strings. Garante override correto.

---

## 8. Variants — CVA (class-variance-authority)

Para componentes com múltiplas variações (button: primary/secondary/destructive × sm/md/lg):

```tsx
// src/components/ui/button.tsx (gerado pelo shadcn)
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
```

**Crie variants no padrão CVA** para qualquer componente próprio com múltiplas formas.

---

## 9. Padrões de uso

### 9.1 Composição

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

<Card>
  <CardHeader>
    <CardTitle>Novo usuário</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Criar</Button>
  </CardContent>
</Card>
```

### 9.2 `asChild` para polimorfismo

Componentes shadcn que estendem Radix aceitam `asChild` para "virar" outro elemento (Link, etc):

```tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

<Button asChild>
  <Link to="/users">Ver usuários</Link>
</Button>
```

Resultado: `<a>` com estilos de botão. Sem `<button>` aninhado em `<a>` (inválido).

### 9.3 Dialogs / Sheets — composição declarativa

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button>Confirmar</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Tem certeza?</DialogTitle>
    </DialogHeader>
    {/* ... */}
  </DialogContent>
</Dialog>
```

Estado controlado se precisar:

```tsx
const [open, setOpen] = useState(false);
<Dialog open={open} onOpenChange={setOpen}>
  {/* ... */}
</Dialog>
```

---

## 10. Acessibilidade

Radix Primitives (base do shadcn) cobre o pesado:
- Focus management
- Keyboard navigation
- ARIA attributes
- Screen reader support

**Sua parte:**
- `aria-label` em ícones-botão sem texto.
- `<label htmlFor>` em todo input (ou usar `<Label>` shadcn).
- Cor não é único significante (não confie só em vermelho/verde).
- Contraste AA (4.5:1 texto normal, 3:1 grandes).
- Foco visível (Tailwind `focus-visible:ring`).
- Sem `outline: none` sem alternativa.
- `prefers-reduced-motion` para animações pesadas.

Teste com:
- Lighthouse Accessibility audit
- axe DevTools browser extension
- Navegação só por teclado (Tab/Shift+Tab/Enter/Space/setas)
- VoiceOver (Mac) / NVDA (Windows)

---

## 11. Convenções de estilo no Tailwind

### 11.1 Ordem das classes

Biome organiza isso automaticamente se configurar `useSortedClasses`:

```json
// biome.json
{
  "linter": {
    "rules": {
      "nursery": { "useSortedClasses": "warn" }
    }
  }
}
```

### 11.2 Quando criar componente vs classes inline

- **Classes inline (Tailwind):** layout/spacing/cor único uso.
- **Componente:** padrão repetido em > 3 lugares.
- **Variant CVA:** componente com múltiplas formas.

### 11.3 Tokens espaçamento (consistência)

Use sempre múltiplos da escala: `p-2, p-4, p-6, p-8, p-12, p-16`. Evite `p-3.5`, `p-[13px]`.

### 11.4 Responsividade

Mobile-first sempre: `text-sm md:text-base lg:text-lg`. Não o contrário.

---

## 12. Ícones

**Lucide React** (padrão do shadcn):

```bash
pnpm add lucide-react
```

```tsx
import { Plus, Trash, Edit } from "lucide-react";

<Button size="icon" aria-label="Adicionar">
  <Plus className="h-5 w-5" />
</Button>
```

Tree-shaken. Cada ícone ~1KB.

---

## 13. Imagens

- **Sempre `width` e `height`** explícitos (evita CLS).
- **`loading="lazy"`** para below-the-fold.
- Para imagens com placeholder/blur, considere `<img>` com `srcset` ou lib de imagem se precisar de otimização avançada (Sharp via build).
- SVG inline para ícones pequenos; `<img>` para fotos.

---

## 14. Checklist de styling

- [ ] Usa Tailwind utility classes (não CSS module / styled-components ad-hoc)
- [ ] `cn()` ao combinar classes condicionais
- [ ] Componentes acessíveis (label, aria, focus visible)
- [ ] Mobile-first responsive
- [ ] Sem cores hardcoded fora do tema (não `bg-blue-500`, use `bg-primary`)
- [ ] Dark mode funciona (testou toggle?)
- [ ] Sem `<img>` sem dimensões
- [ ] Variants via CVA quando componente próprio tem múltiplas formas
- [ ] Ícones com `aria-label` quando único conteúdo do botão
