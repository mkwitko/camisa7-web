import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

const DEFAULT_LOCALE = ptBR;
const FALLBACK_TIMEZONE = "America/Sao_Paulo";

/**
 * Detects the guest's browser timezone. The backend always sends UTC
 * (`Z`-suffixed ISO strings) — conversion to local time happens only here,
 * at display time.
 */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Parses an ISO string into a `Date`, returning `null` when invalid. */
export function parseIso(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "quarta-feira, 27 de maio às 20:00" — the format used on the pelada card.
 */
export function formatMatchDateTime(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "EEEE, d 'de' MMMM 'às' HH:mm", {
    locale: DEFAULT_LOCALE,
  });
}

/** "20:00" */
export function formatTime(input: string | Date, timezone: string): string {
  const d = parseIso(input);
  if (!d) return "";
  return formatInTimeZone(d, timezone, "HH:mm", { locale: DEFAULT_LOCALE });
}
