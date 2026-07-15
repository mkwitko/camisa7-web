import type { PublicConfirmMutationResponse } from "@/api/generated/types/PublicConfirm";
import { PixKeySection } from "@/components/invite/pix-key-section";
import { InlineMessage } from "@/components/ui/inline-message";
import { useTranslation } from "react-i18next";

type Props = {
  result: PublicConfirmMutationResponse;
  pixKey: string | null;
};

export function ConfirmResult({ result, pixKey }: Props) {
  const { t } = useTranslation("invite");

  if (result.status === "waitlisted") {
    return (
      <InlineMessage variant="success" className="flex-col items-start gap-1">
        <p className="font-display text-xl uppercase tracking-wide">
          {t("result.waitlisted.title", { position: result.waitlistPos })}
        </p>
        <p className="text-ink/80">{t("result.waitlisted.description")}</p>
      </InlineMessage>
    );
  }

  return (
    <div className="space-y-4">
      <InlineMessage variant="success" className="flex-col items-start gap-1">
        <p className="font-display text-xl uppercase tracking-wide">
          {t("result.confirmed.title")}
        </p>
        <p className="text-ink/80">{t("result.confirmed.description")}</p>
      </InlineMessage>
      {pixKey && <PixKeySection pixKey={pixKey} />}
    </div>
  );
}
