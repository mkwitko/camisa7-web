import * as fmt from "@/lib/datetime/format";
import * as numFmt from "@/lib/format-numbers";
import { useMemo } from "react";

/**
 * Formatting helpers pre-bound to the guest's browser timezone/locale.
 * Never call `Intl`/`date-fns-tz` directly from a component — go through here.
 */
export function useFormat() {
  const tz = useMemo(() => fmt.detectBrowserTimezone(), []);

  return {
    matchDateTime: (input: string | Date) => fmt.formatMatchDateTime(input, tz),
    time: (input: string | Date) => fmt.formatTime(input, tz),
    currency: (cents: number) => numFmt.formatCurrencyFromCents(cents),
  };
}
