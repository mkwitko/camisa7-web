import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

export function InviteSkeleton() {
  const { t } = useTranslation("invite");
  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface p-6" aria-busy="true">
      <span className="sr-only">{t("skeleton.label")}</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
