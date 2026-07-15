import { Button } from "@/components/ui/button";
import { useClipboard } from "@/hooks/common/use-clipboard";
import { Link as LinkIcon, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  name: string;
  /** Overridable for tests; defaults to the current page URL. */
  url?: string;
};

function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function ShareButton({ name, url }: Props) {
  const { t } = useTranslation("profile");
  const { copied, copy } = useClipboard();
  const canShare = canUseWebShare();

  const handleClick = async () => {
    const shareUrl = url ?? window.location.href;

    if (canShare) {
      try {
        await navigator.share({
          title: t("meta.title", { name }),
          text: t("share.text", { name }),
          url: shareUrl,
        });
        return;
      } catch {
        // User dismissed the native share sheet — nothing to do.
        return;
      }
    }

    await copy(shareUrl);
  };

  const Icon = canShare ? Share2 : LinkIcon;
  const label = copied ? t("share.copied") : canShare ? t("share.button") : t("share.copy");

  return (
    <Button type="button" size="lg" className="w-full" onClick={handleClick}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </Button>
  );
}
