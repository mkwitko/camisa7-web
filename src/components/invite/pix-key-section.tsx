import { Button } from "@/components/ui/button";
import { useClipboard } from "@/hooks/common/use-clipboard";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PixKeySection({ pixKey }: { pixKey: string }) {
  const { t } = useTranslation("invite");
  const { copied, copy } = useClipboard();

  return (
    <div className="rounded-md border border-line bg-surface-up p-4">
      <p className="font-medium text-muted text-xs uppercase tracking-wide">
        {t("card.pix.title")}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate text-ink text-sm">{pixKey}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy(pixKey)}
          aria-label={t("card.pix.copy")}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              {t("card.pix.copied")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {t("card.pix.copy")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
