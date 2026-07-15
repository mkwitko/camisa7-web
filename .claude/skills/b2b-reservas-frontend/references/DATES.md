# DATES.md — Datas e Timezones no Frontend

> Backend manda **string ISO 8601 em UTC** com `Z` (ex: `2026-05-27T17:00:00.000Z`). O frontend **converte para o fuso do usuário** e exibe no formato local. Conversão é responsabilidade nossa — a regra é explícita em [`backend/docs/DATES.md`](../backend/docs/DATES.md).

> Este é o documento mais traiçoeiro do projeto. Leia antes de qualquer feature com data.

---

## 1. Princípios

1. **Backend é UTC.** Toda data que entra/sai da API é string ISO 8601 com `Z` no fim. Nunca offset (`-03:00`), nunca naive (sem timezone). O backend explicitou isso.
2. **`Date` é sempre instante, nunca "data civil".** `new Date("2026-05-27T17:00:00Z")` é **um momento absoluto no tempo**, não "27 de maio". Pensar em "data civil" exige fuso.
3. **Conversão para fuso é uma camada de apresentação.** A lógica de negócio do front trabalha com `Date` (instante UTC). Só na hora de **exibir** ou de **parsear input do usuário** é que o fuso entra.
4. **Fuso default = `Intl` do navegador.** Usuário pode sobrescrever em "Preferências". Funções de formatação **sempre** recebem o fuso ativo do `useTimezone()`.
5. **Comparações por instante (UTC), nunca por string.** `dateA.getTime() < dateB.getTime()`. Comparar strings ISO funciona por sorte (lexicograficamente equivale em UTC com `Z`), mas é frágil.
6. **Datas civis sem hora** (data de nascimento, data de validade do documento) são caso especial — ver § 9.

---

## 2. Stack

- **`Date` nativo** — instante absoluto, base de tudo.
- **`Intl.DateTimeFormat`** — formatação locale-aware (i18n nativo, zero KB).
- **`date-fns`** — manipulação imutável (`addDays`, `isSameDay`, `startOfMonth`, `differenceInMinutes`).
- **`date-fns-tz`** — formatação e conversão com timezone explícito (`formatInTimeZone`, `toZonedTime`).
- **Sem moment, Day.js, Luxon.** Justificativa em [`DECISIONS.md`](./DECISIONS.md#adr-014).

```bash
pnpm add date-fns date-fns-tz
```

Bundle: ~8KB gzipped no uso típico (tree-shaken). Cada import é independente.

---

## 3. Detecção do timezone do usuário

### 3.1 Default: `Intl` do navegador

```ts
// src/lib/datetime/timezone.ts
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo"; // fallback determinístico
  }
}

// Schema para validar overrides (lista oficial IANA Time Zone DB)
const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Timezone inválido" },
);

type TimezoneState = {
  override: string | null;          // null = usa o do navegador
  setOverride: (tz: string | null) => void;
};

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set) => ({
      override: null,
      setOverride: (tz) => {
        if (tz !== null) timezoneSchema.parse(tz); // valida antes de salvar
        set({ override: tz });
      },
    }),
    { name: "timezone-pref" },
  ),
);
```

### 3.2 Hook `useTimezone`

Único ponto de entrada. Componentes nunca chamam `Intl` ou leem store direto.

```ts
// src/hooks/use-timezone.ts
import { useTimezoneStore, detectBrowserTimezone } from "@/lib/datetime/timezone";
import { useMemo } from "react";

export function useTimezone(): string {
  const override = useTimezoneStore((s) => s.override);
  return useMemo(() => override ?? detectBrowserTimezone(), [override]);
}
```

```tsx
function BookingRow({ booking }: { booking: Booking }) {
  const tz = useTimezone();
  return <span>{formatDateTime(booking.startsAt, tz)}</span>;
}
```

### 3.3 Seletor de timezone (Preferências)

```tsx
// src/components/settings/timezone-select.tsx
import { useTimezoneStore, detectBrowserTimezone } from "@/lib/datetime/timezone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Lista curada das mais comuns para o caso B2B BR + internacional
const COMMON_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Recife",
  "America/Noronha",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
] as const;

export function TimezoneSelect() {
  const override = useTimezoneStore((s) => s.override);
  const setOverride = useTimezoneStore((s) => s.setOverride);
  const detected = detectBrowserTimezone();
  const current = override ?? "auto";

  return (
    <Select value={current} onValueChange={(v) => setOverride(v === "auto" ? null : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automático ({detected})</SelectItem>
        {COMMON_TIMEZONES.map((tz) => (
          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

> Lista hardcoded em vez do dump completo do IANA (~600 fusos) porque 95% dos casos cabem em uma lista curta. Para acesso ao catálogo completo, use `Intl.supportedValuesOf("timeZone")` (disponível desde 2022) — mas opção comum é UX ruim em select gigante.

---

## 4. Utilitários centrais — `src/lib/datetime/format.ts`

**Todo componente formata data via essas funções.** Nada de `Intl.DateTimeFormat` ou `.toLocaleDateString()` ad hoc espalhado.

```ts
// src/lib/datetime/format.ts
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
  isSameDay,
  isToday as fnsIsToday,
  isYesterday as fnsIsYesterday,
  isTomorrow as fnsIsTomorrow,
  differenceInMinutes,
} from "date-fns";

const DEFAULT_LOCALE = ptBR;

/**
 * Converte string ISO em Date, com sanity check.
 * Use ao receber strings de API ou search params.
 */
export function parseIso(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formato: "27/05/2026"
 */
export function formatDate(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "dd/MM/yyyy", { locale: DEFAULT_LOCALE });
}

/**
 * Formato: "27/05/2026 14:30"
 */
export function formatDateTime(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "dd/MM/yyyy HH:mm", { locale: DEFAULT_LOCALE });
}

/**
 * Formato: "14:30"
 */
export function formatTime(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "HH:mm", { locale: DEFAULT_LOCALE });
}

/**
 * Formato: "27 de maio de 2026, quarta-feira"
 */
export function formatDateLong(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "d 'de' MMMM 'de' yyyy, EEEE", { locale: DEFAULT_LOCALE });
}

/**
 * "Hoje, 14:30" / "Ontem, 14:30" / "Amanhã, 14:30" / "27/05, 14:30" / "27/05/2026, 14:30"
 * Usado em listas e cards.
 */
export function formatSmart(input: string | Date, timezone: string, now: Date = new Date()): string {
  const d = parseIso(input);
  if (!d) return "";

  // Compara "mesmo dia" no fuso do usuário
  const dInTz = toZonedTime(d, timezone);
  const nowInTz = toZonedTime(now, timezone);
  const time = formatInTimeZone(d, timezone, "HH:mm", { locale: DEFAULT_LOCALE });

  if (isSameDay(dInTz, nowInTz)) return `Hoje, ${time}`;
  if (fnsIsYesterday(dInTz)) return `Ontem, ${time}`;
  if (fnsIsTomorrow(dInTz)) return `Amanhã, ${time}`;

  const sameYear = dInTz.getFullYear() === nowInTz.getFullYear();
  return formatInTimeZone(
    d,
    timezone,
    sameYear ? "dd/MM, HH:mm" : "dd/MM/yyyy, HH:mm",
    { locale: DEFAULT_LOCALE },
  );
}

/**
 * Tempo relativo: "em 3 min", "há 2 h", "há 5 dias"
 * Usa Intl.RelativeTimeFormat nativo (zero KB extra).
 */
export function formatRelative(input: string | Date, locale = "pt-BR", now: Date = new Date()): string {
  const d = parseIso(input);
  if (!d) return "";
  const diffMin = differenceInMinutes(d, now);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMin) < 1) return rtf.format(0, "minute");
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffMin) < 60 * 24) return rtf.format(Math.round(diffMin / 60), "hour");
  return rtf.format(Math.round(diffMin / (60 * 24)), "day");
}

/**
 * Intervalo: "27/05, 14:00 – 15:30" / "27/05, 23:00 – 28/05, 01:00"
 */
export function formatRange(
  startInput: string | Date,
  endInput: string | Date,
  timezone: string,
): string {
  const start = parseIso(startInput);
  const end = parseIso(endInput);
  if (!start || !end) return "";

  const startInTz = toZonedTime(start, timezone);
  const endInTz = toZonedTime(end, timezone);
  const sameDay = isSameDay(startInTz, endInTz);

  if (sameDay) {
    const date = formatInTimeZone(start, timezone, "dd/MM", { locale: DEFAULT_LOCALE });
    const startTime = formatInTimeZone(start, timezone, "HH:mm");
    const endTime = formatInTimeZone(end, timezone, "HH:mm");
    return `${date}, ${startTime} – ${endTime}`;
  }
  const startStr = formatInTimeZone(start, timezone, "dd/MM, HH:mm", { locale: DEFAULT_LOCALE });
  const endStr = formatInTimeZone(end, timezone, "dd/MM, HH:mm", { locale: DEFAULT_LOCALE });
  return `${startStr} – ${endStr}`;
}
```

### 4.1 Hook `useFormat` — atalho que injeta o timezone

```ts
// src/hooks/common/use-format.ts
import { useTimezone } from "./use-timezone";
import * as fmt from "@/lib/datetime/format";

export function useFormat() {
  const tz = useTimezone();
  return {
    date: (input: string | Date) => fmt.formatDate(input, tz),
    dateTime: (input: string | Date) => fmt.formatDateTime(input, tz),
    time: (input: string | Date) => fmt.formatTime(input, tz),
    dateLong: (input: string | Date) => fmt.formatDateLong(input, tz),
    smart: (input: string | Date, now?: Date) => fmt.formatSmart(input, tz, now),
    relative: (input: string | Date, now?: Date) => fmt.formatRelative(input, "pt-BR", now),
    range: (start: string | Date, end: string | Date) => fmt.formatRange(start, end, tz),
  };
}
```

Uso típico:

```tsx
function BookingCard({ booking }: { booking: Booking }) {
  const f = useFormat();
  return (
    <article>
      <p>{f.smart(booking.startsAt)}</p>
      <p>{f.range(booking.startsAt, booking.endsAt)}</p>
      <small>Criado {f.relative(booking.createdAt)}</small>
    </article>
  );
}
```

---

## 5. Input — usuário digita data/hora

O caminho inverso. Datepicker (ou form input) produz "ano, mês, dia, hora, minuto" no fuso do usuário. Nós convertemos para **instante UTC** e mandamos pro backend.

### 5.1 Função canônica `zonedFieldsToUtc`

```ts
// src/lib/datetime/parse.ts
import { fromZonedTime } from "date-fns-tz";

type DateFields = {
  year: number;
  month: number;    // 1-12
  day: number;
  hour: number;     // 0-23
  minute: number;
  second?: number;
};

/**
 * Converte "27/05/2026 14:00 em America/Sao_Paulo" → Date (instante UTC).
 * O Date resultante .toISOString() devolve "2026-05-27T17:00:00.000Z".
 */
export function zonedFieldsToUtc(fields: DateFields, timezone: string): Date {
  // Date "local" (mas vamos reinterpretar como sendo no fuso passado)
  const localDate = new Date(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second ?? 0,
  );
  // fromZonedTime: "esse Date 'local' representa que horas no fuso X? me devolve o instante UTC equivalente"
  return fromZonedTime(localDate, timezone);
}

/**
 * Inverso: Date UTC → fields no fuso do usuário (útil para popular o form em edição).
 */
export function utcToZonedFields(date: Date, timezone: string): DateFields {
  // toZonedTime devolve um Date cujos getFullYear/getMonth/etc. dão os valores no fuso.
  // É um Date "envenenado" — só use para extrair os campos, não para serializar.
  const z = toZonedTime(date, timezone);
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    second: z.getSeconds(),
  };
}
```

> `import { toZonedTime } from "date-fns-tz"` no segundo trecho.

### 5.2 Integração com React Hook Form

Form trabalha com `Date` (instante UTC). Datepicker mostra no fuso do usuário. Submit envia ISO string.

```tsx
// src/components/bookings/booking-form.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTimezone } from "@/hooks/use-timezone";
import { zonedFieldsToUtc, utcToZonedFields } from "@/lib/datetime/parse";

const schema = z.object({
  startsAt: z.date(),          // armazenado como Date (instante)
  endsAt: z.date(),
}).refine((d) => d.endsAt > d.startsAt, {
  message: "Fim deve ser depois do início",
  path: ["endsAt"],
});

type Input = z.infer<typeof schema>;

export function BookingForm({ defaultStartsAt, defaultEndsAt, onSubmit }: Props) {
  const tz = useTimezone();
  const form = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: {
      startsAt: defaultStartsAt ?? new Date(),
      endsAt: defaultEndsAt ?? new Date(Date.now() + 60 * 60_000),
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => onSubmit({
      startsAt: data.startsAt.toISOString(),    // envia UTC pro backend
      endsAt: data.endsAt.toISOString(),
    }))}>
      <DateTimeField
        label="Início"
        value={form.watch("startsAt")}
        onChange={(d) => form.setValue("startsAt", d)}
        timezone={tz}
      />
      {/* ... */}
    </form>
  );
}
```

```tsx
// src/components/ui/date-time-field.tsx (esqueleto)
import { Calendar } from "@/components/ui/calendar";        // shadcn
import { utcToZonedFields, zonedFieldsToUtc } from "@/lib/datetime/parse";

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  timezone: string;
};

export function DateTimeField({ label, value, onChange, timezone }: Props) {
  const fields = utcToZonedFields(value, timezone);

  const updateFields = (patch: Partial<typeof fields>) => {
    const next = { ...fields, ...patch };
    onChange(zonedFieldsToUtc(next, timezone));
  };

  return (
    <div>
      <label>{label}</label>
      <Calendar
        mode="single"
        selected={new Date(fields.year, fields.month - 1, fields.day)}
        onSelect={(d) => d && updateFields({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
        })}
      />
      <Input
        type="time"
        value={`${String(fields.hour).padStart(2, "0")}:${String(fields.minute).padStart(2, "0")}`}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          updateFields({ hour: h, minute: m });
        }}
      />
    </div>
  );
}
```

**Por que `Calendar` recebe um `Date` "local" e não o `value` direto:** o componente do shadcn (baseado em `react-day-picker`) interpreta o `Date` no fuso do navegador. Precisamos passar um `Date` cujos campos `getFullYear/getMonth/getDate` correspondam ao dia **no fuso do usuário** — daí `new Date(fields.year, fields.month - 1, fields.day)`. Esse `Date` é "envenenado" (sua representação UTC é arbitrária), mas isso não importa porque só o usamos pra display do calendário.

### 5.3 Search params com data

Filtros de listagem (`?from=2026-05-01&to=2026-05-31`) seguem o padrão: usuário escolhe **datas civis** no seu fuso; convertemos pra range UTC ao mandar pra API.

```ts
const schema = z.object({
  from: z.string().date().optional(),   // "2026-05-01"
  to: z.string().date().optional(),
});

// ao chamar API:
const fromUtc = from
  ? zonedFieldsToUtc({ year, month, day, hour: 0, minute: 0 }, tz).toISOString()
  : undefined;
const toUtc = to
  ? zonedFieldsToUtc({ year, month, day, hour: 23, minute: 59, second: 59 }, tz).toISOString()
  : undefined;
```

> "Reservas de maio" significa "00:00:00 do dia 1 ao 23:59:59 do dia 31 **no fuso do usuário**", que vira `2026-05-01T03:00:00Z` a `2026-06-01T02:59:59Z` em SP. A API recebe instantes; o filtro lá é por timestamp absoluto. Trocar de fuso recarrega a tela ⇒ resultados podem mudar nas bordas (esperado).

---

## 6. Comparações e operações

Sempre via **instante** (`getTime()` ou `Date`), nunca via string.

```ts
import { isAfter, isBefore, differenceInMinutes, addDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// Comparar dois instantes — fuso não importa
isAfter(parseIso(a)!, parseIso(b)!);

// Diferença em minutos — fuso não importa
differenceInMinutes(parseIso(end)!, parseIso(start)!);

// "Mesma data (civil) no fuso do usuário?" — fuso IMPORTA
const aInTz = toZonedTime(parseIso(a)!, tz);
const bInTz = toZonedTime(parseIso(b)!, tz);
isSameDay(aInTz, bInTz);

// "Início do dia atual no fuso do usuário, em UTC" (ex: pra montar query)
const todayStartUtc = fromZonedTime(startOfDay(toZonedTime(new Date(), tz)), tz);
```

**Regra:** se a operação só depende de instantes (somar minutos, comparar momentos), **não toque em fuso**. Se a operação depende de "dia civil" (mesma data, início da semana, próximo dia útil), **converta pra fuso**, faça a operação com `date-fns`, e converta de volta.

---

## 7. Armadilhas comuns

### 7.1 `new Date("2026-05-27")` interpreta como UTC

```ts
new Date("2026-05-27")           // 2026-05-27T00:00:00Z (UTC!)
new Date("2026-05-27T00:00:00")  // local time (varia por máquina)
```

Para um usuário em SP, o primeiro vira "26/05, 21:00" ao formatar. **Bug clássico**. Solução: sempre receba datas com `Z` do backend, ou use `zonedFieldsToUtc` ao construir.

### 7.2 `toLocaleString("pt-BR")` usa fuso do navegador

```ts
date.toLocaleString("pt-BR", { dateStyle: "short" });
```

Ignora o override do perfil. **Não use** essa API direto — sempre via `formatInTimeZone` que recebe `tz` explícito.

### 7.3 `getTimezoneOffset()` retorna minutos com **sinal invertido**

Para SP (UTC-3), retorna `180`, não `-180`. Confusão garantida. Não use; use `date-fns-tz`.

### 7.4 DST (horário de verão)

Brasil aboliu em 2019, mas voltar é possível, e usuários no Chile/Europa/EUA têm DST ativo. `date-fns-tz` lida corretamente (mesma noite pode ter 23h ou 25h reais). Não tente reimplementar.

### 7.5 Diferença de 1 dia ao formatar reservas próximas da meia-noite

Reserva às 23:30 UTC de 27/05 → exibida como 20:30 de 27/05 em SP, **mas** como 01:30 de 28/05 em Lisboa. Não é bug; é correto. Se a feature precisa "dia da reserva no fuso do estabelecimento" (não do usuário), o backend tem que mandar esse fuso junto e formatamos com ele — veja § 9.

### 7.6 `Intl.DateTimeFormat` com `timeZone` inválido lança em runtime

`new Intl.DateTimeFormat("pt-BR", { timeZone: "Foo/Bar" })` → `RangeError`. Por isso o `timezoneSchema` (§ 3.1) valida antes de salvar override.

### 7.7 Backend pode mandar `null` em campos de data opcionais

Tipos do Kubb refletem isso. Sempre check antes de formatar:

```tsx
{booking.canceledAt && <span>Cancelado {f.relative(booking.canceledAt)}</span>}
```

`parseIso(null)` retorna `null`, mas usar o resultado direto sem checar quebra o `f.dateTime(null)` (retorna `""` mas é silencioso — pior que erro explícito em alguns casos).

---

## 8. Testes — como evitar testes flakey

Datas em testes são **a fonte clássica de flakiness**. Três regras:

### 8.1 Use fake timers do Vitest

```ts
import { vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-27T17:00:00Z")); // ancora "agora"
});

afterEach(() => {
  vi.useRealTimers();
});
```

`formatSmart`, `formatRelative` e qualquer função que use "agora" passam a ser determinísticas.

### 8.2 Force o `TZ` do ambiente de teste

CI roda em UTC; sua máquina pode estar em outro fuso → testes passam local, falham no CI (ou vice-versa). Pin via script:

```json
// package.json
{
  "scripts": {
    "test": "TZ=UTC vitest",
    "test:run": "TZ=UTC vitest run"
  }
}
```

> **Por que UTC, não SP:** `formatInTimeZone(date, "America/Sao_Paulo", ...)` independe do `TZ` do processo — date-fns-tz é determinístico. Mas operações com `Date` "envenenado" (ver § 5.2) podem variar. UTC elimina ambiguidade.

### 8.3 Sempre passe `now` explicitamente quando relevante

`formatSmart(d, tz, now)` aceita `now` como último arg. Em testes:

```ts
test("formats today", () => {
  const now = new Date("2026-05-27T17:00:00Z");
  const d = new Date("2026-05-27T19:30:00Z");
  expect(formatSmart(d, "America/Sao_Paulo", now)).toBe("Hoje, 16:30");
});

test("formats yesterday across midnight", () => {
  const now = new Date("2026-05-27T03:00:00Z");   // 00h em SP, 27/05
  const d = new Date("2026-05-27T02:00:00Z");      // 23h em SP, 26/05
  expect(formatSmart(d, "America/Sao_Paulo", now)).toBe("Ontem, 23:00");
});
```

### 8.4 Teste o caso de DST se sua app pode rodar em fuso com DST

```ts
test("addDays crosses DST boundary correctly", () => {
  const before = fromZonedTime(new Date(2025, 2, 8, 12, 0), "America/New_York"); // antes do DST
  const result = addDays(before, 1);
  // formatInTimeZone deve mostrar 12:00 no dia seguinte (date-fns-tz cuida)
  expect(formatInTimeZone(result, "America/New_York", "HH:mm")).toBe("12:00");
});
```

---

## 9. Casos especiais

### 9.1 Data civil pura (sem hora)

"Data de nascimento", "data de validade". Não tem instante — é uma data **independente de fuso**.

Backend pode mandar como `"2026-05-27"` (string sem `Z`). **Não converta para `Date`** — você perde a propriedade "civil".

```ts
// Trate como string
const birthDate: string = user.birthDate; // "1990-03-15"
// Formate sem conversão
const [y, m, d] = birthDate.split("-").map(Number);
formatDateCivil(y, m, d); // "15/03/1990"
```

Crie helper se aparecer mais de duas vezes:

```ts
// src/lib/datetime/civil.ts
export function formatCivilDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
```

Não há ambiguidade nem fuso aqui — é uma data como uma cor: dado puro.

### 9.2 Reserva no fuso do estabelecimento

"Hotel em SP recebe reserva pra 14h de SP, hóspede em Lisboa vê a reserva — quer ver 14h também, não 18h."

**Solução:** backend manda o fuso do estabelecimento junto. Frontend formata explicitamente nesse fuso, ignorando o do usuário:

```ts
// API entrega
type Booking = {
  startsAt: string;            // "2026-05-27T17:00:00Z"
  venueTimezone: string;       // "America/Sao_Paulo"
};

// Componente
<p>{formatDateTime(booking.startsAt, booking.venueTimezone)}</p>
<small>(horário do local)</small>
```

Se "horário do local" tem que aparecer junto com "seu horário", mostre os dois:

```tsx
<>
  <p>Início: {formatDateTime(booking.startsAt, booking.venueTimezone)} <small>({booking.venueTimezone})</small></p>
  <p>No seu fuso: {formatDateTime(booking.startsAt, userTz)}</p>
</>
```

Não use `useTimezone()` cego pra esse caso — fuso do estabelecimento vem da API.

### 9.3 "Quantos dias até a reserva"

```ts
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const days = differenceInCalendarDays(
  toZonedTime(parseIso(booking.startsAt)!, tz),
  toZonedTime(new Date(), tz),
);
```

`differenceInCalendarDays` usa a virada do dia **civil**, não 24h cheias. "Reserva é amanhã às 1h da manhã" e "agora são 23h" → diferença = 1 dia, correto.

---

## 10. Integração com TanStack Router (search params)

```tsx
const searchSchema = z.object({
  from: z.string().date().optional(),   // YYYY-MM-DD (civil)
  to: z.string().date().optional(),
});
```

Em vez de passar instantes na URL (feio, dependente de fuso), passe **datas civis** e converta pra instante na chamada da API. URL fica legível e shareable.

---

## 11. Display em locale ≠ pt-BR (preparação futura)

Quando ativarmos `en`/`es`, `formatInTimeZone` aceita locale dinâmico:

```ts
import { ptBR, enUS, es } from "date-fns/locale";

const LOCALES = { "pt-BR": ptBR, "en": enUS, "es": es };

export function formatDateTime(input: string | Date, timezone: string, locale = "pt-BR") {
  return formatInTimeZone(input, timezone, "PPp", { locale: LOCALES[locale] });
}
```

`"PPp"` é um **token de locale** do date-fns — formata "long date + time" no estilo nativo do idioma (em pt-BR vira "27 de mai. de 2026, 14:30"; em en-US, "May 27, 2026, 2:30 PM"). Use tokens de locale (`PPp`, `PPPp`, `pp`) em vez de hardcoded `dd/MM/yyyy` quando a feature for i18n-ready de verdade.

Hook `useFormat()` deve receber o locale ativo do i18next. Ver [`I18N.md`](./I18N.md).

---

## 12. Checklist (PR review)

- [ ] Nenhuma chamada direta a `.toLocaleDateString`, `.toLocaleString`, `Intl.DateTimeFormat` fora de `src/lib/datetime/`
- [ ] Nenhum `new Date("YYYY-MM-DD")` sem `Z` ou sem `T...` (interpretação UTC silenciosa)
- [ ] Formatação usa `useFormat()` ou função de `format.ts`
- [ ] Comparações usam `Date.getTime()` ou `date-fns` (`isAfter`, `isBefore`)
- [ ] Operações "no dia civil" usam `toZonedTime` antes
- [ ] Submit de form envia `Date.toISOString()` (com `Z`)
- [ ] Input de form usa `zonedFieldsToUtc` ao converter campos do datepicker
- [ ] Testes definem `TZ=UTC` no `package.json` e usam `vi.useFakeTimers` + `vi.setSystemTime`
- [ ] Datas civis sem hora não passam por `new Date()` — tratadas como string
- [ ] Reservas com fuso do estabelecimento usam o `venueTimezone` da API, não `useTimezone()`
- [ ] `null`/`undefined` checados antes de formatar
