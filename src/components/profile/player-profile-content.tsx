import type { ApiError } from "@/api/client";
import { useGetPublicProfile } from "@/api/generated/hooks/playersHooks/useGetPublicProfile";
import { PlayerCard } from "@/components/profile/player-card";
import { ProfileErrorState } from "@/components/profile/profile-error-state";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { ShareButton } from "@/components/profile/share-button";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  playerId: string;
};

export function PlayerProfileContent({ playerId }: Props) {
  const { t } = useTranslation(["profile", "common"]);
  const { data: profile, error, isLoading, refetch } = useGetPublicProfile(playerId);
  const notFound = (error as ApiError | null)?.status === 404;

  useEffect(() => {
    document.title = profile
      ? t("profile:meta.title", { name: profile.name })
      : t("common:brand.name");
  }, [profile, t]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <p className="font-display text-2xl text-primary uppercase tracking-wide">
          {t("common:brand.name")}
        </p>
      </header>

      {isLoading && <ProfileSkeleton />}

      {!isLoading && error && (
        <ProfileErrorState variant={notFound ? "notFound" : "generic"} onRetry={() => refetch()} />
      )}

      {!isLoading && !error && profile && (
        <div className="space-y-6">
          <PlayerCard profile={profile} />
          <ShareButton name={profile.name} />
          <p className="text-center text-muted text-xs">{t("profile:cta.text")}</p>
        </div>
      )}
    </main>
  );
}
