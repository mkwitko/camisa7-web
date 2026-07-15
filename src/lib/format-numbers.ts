export function formatCurrency(value: number, locale = "pt-BR", currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

/** Backend stores prices as integer cents — divide before formatting. */
export function formatCurrencyFromCents(cents: number, locale = "pt-BR", currency = "BRL"): string {
  return formatCurrency(cents / 100, locale, currency);
}
