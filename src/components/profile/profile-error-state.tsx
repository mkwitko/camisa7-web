import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  variant: "notFound" | "generic";
  onRetry?: () => void;
};

export function ProfileErrorState({ variant, onRetry }: Props) {
  const { t } = useTranslation(["profile", "common"]);
  const Icon = variant === "notFound" ? UserX : AlertTriangle;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8 text-center">
      <Icon className="h-10 w-10 text-danger" aria-hidden="true" />
      <div>
        <h1 className="font-display text-2xl text-ink uppercase tracking-wide">
          {t(`error.${variant}.title`)}
        </h1>
        <p className="mt-2 text-muted text-sm">{t(`error.${variant}.description`)}</p>
      </div>
      {variant === "notFound" ? (
        <a href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("common:actions.back")}
        </a>
      ) : (
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t("common:actions.retry")}
          </Button>
        )
      )}
    </div>
  );
}
