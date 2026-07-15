import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  /** Softens the tile for a zero/absent stat instead of hiding it (keeps the grid stable). */
  muted?: boolean;
  /** Spans both grid columns — used for the richer "streak + record" tile. */
  wide?: boolean;
};

export function StatTile({ icon: Icon, label, value, hint, muted, wide }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg bg-surface-up/60 px-3 py-4 text-center",
        wide && "col-span-2 flex-row justify-center gap-3 text-left",
        muted && "opacity-45",
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="font-display text-2xl text-ink leading-none">{value}</p>
        <p className="mt-1 text-[11px] text-muted uppercase tracking-wide">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-primary">{hint}</p>}
      </div>
    </div>
  );
}
