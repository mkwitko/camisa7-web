import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

export function ProfileSkeleton() {
  const { t } = useTranslation("profile");

  return (
    <div
      className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border-2 border-line bg-surface p-6"
      aria-busy="true"
    >
      <span className="sr-only">{t("skeleton.label")}</span>
      <Skeleton className="mx-auto h-4 w-24" />
      <Skeleton className="mx-auto h-16 w-40" />
      <Skeleton className="mx-auto h-7 w-48" />
      <div className="grid grid-cols-2 gap-2 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
