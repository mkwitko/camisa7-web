import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  variant: "invalidToken" | "generic";
  onRetry?: () => void;
};

export function InviteErrorState({ variant, onRetry }: Props) {
  const { t } = useTranslation(["invite", "common"]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
      <div>
        <h1 className="font-display text-2xl text-ink uppercase tracking-wide">
          {t(`error.${variant}.title`)}
        </h1>
        <p className="mt-2 text-muted text-sm">{t(`error.${variant}.description`)}</p>
      </div>
      {variant === "generic" && onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t("common:actions.retry")}
        </Button>
      )}
    </div>
  );
}
