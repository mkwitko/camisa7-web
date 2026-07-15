import type { ResolveInvite200StatusEnum } from "@/api/generated/types/ResolveInvite";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const STYLES: Record<ResolveInvite200StatusEnum, string> = {
  open: "bg-primary/15 text-primary",
  full: "bg-tier-ouro/15 text-tier-ouro",
  closed: "bg-muted/15 text-muted",
  finished: "bg-muted/15 text-muted",
  cancelled: "bg-danger/15 text-danger",
};

export function StatusBadge({ status }: { status: ResolveInvite200StatusEnum }) {
  const { t } = useTranslation("invite");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 font-medium text-xs uppercase tracking-wide",
        STYLES[status],
      )}
    >
      {t(`card.status.${status}`)}
    </span>
  );
}
