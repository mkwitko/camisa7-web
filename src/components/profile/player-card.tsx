import type {
  GetPublicProfile200,
  GetPublicProfile200LevelEnum,
} from "@/api/generated/types/GetPublicProfile";
import { StatTile } from "@/components/profile/stat-tile";
import { useFormat } from "@/hooks/common/use-format";
import { cn } from "@/lib/utils";
import { Calendar, Flame, Goal, Handshake, ShieldCheck, Star, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  profile: GetPublicProfile200;
};

// Static class strings (not template-interpolated) so Tailwind's scanner picks them up.
const TIER_BORDER: Record<GetPublicProfile200LevelEnum, string> = {
  bronze: "border-tier-bronze",
  prata: "border-tier-prata",
  ouro: "border-tier-ouro",
};

const TIER_TEXT: Record<GetPublicProfile200LevelEnum, string> = {
  bronze: "text-tier-bronze",
  prata: "text-tier-prata",
  ouro: "text-tier-ouro",
};

const TIER_SHEEN: Record<GetPublicProfile200LevelEnum, string> = {
  bronze: "from-tier-bronze/20",
  prata: "from-tier-prata/25",
  ouro: "from-tier-ouro/25",
};

const POSITION_ORDER = ["goleiro", "zagueiro", "lateral", "volante", "meia", "atacante"] as const;

export function PlayerCard({ profile }: Props) {
  const { t } = useTranslation("profile");
  const f = useFormat();

  const positions = POSITION_ORDER.filter(
    (position) => profile.overallByPosition[position] !== undefined,
  );

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 bg-surface shadow-black/30 shadow-xl",
        TIER_BORDER[profile.level],
      )}
    >
      {/* Metallic sheen — tier-tinted gradient over the card surface. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent",
          TIER_SHEEN[profile.level],
        )}
        aria-hidden="true"
      />

      <div className="relative p-6">
        <p
          className={cn(
            "text-center font-display text-sm uppercase tracking-[0.2em]",
            TIER_TEXT[profile.level],
          )}
        >
          {t("level.label", { level: t(`level.${profile.level}`) })}
        </p>

        <div className="mt-4 flex items-center justify-center gap-4">
          <span className="font-display text-7xl text-ink leading-none">{profile.bestOverall}</span>
          {profile.bestPosition && (
            <span
              className={cn(
                "flex h-12 w-16 items-center justify-center rounded-md border-2 font-display text-ink text-lg tracking-wide",
                TIER_BORDER[profile.level],
              )}
            >
              {t(`position.${profile.bestPosition}`)}
            </span>
          )}
        </div>

        <h1 className="mt-3 text-center font-display text-3xl text-ink uppercase tracking-wide">
          {profile.name}
        </h1>

        {positions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {positions.map((position) => (
              <span
                key={position}
                className="rounded-full bg-surface-up px-3 py-1 text-muted text-xs"
                title={t("overallByPosition.title")}
              >
                {t(`position.${position}`)} {profile.overallByPosition[position]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <StatTile
            icon={Calendar}
            label={t("stats.matchesPlayed")}
            value={String(profile.matchesPlayed)}
            muted={profile.matchesPlayed === 0}
          />
          <StatTile
            icon={Trophy}
            label={t("stats.wins")}
            value={String(profile.wins)}
            hint={
              profile.matchesPlayed > 0
                ? t("stats.winRate", { rate: f.percent(profile.winRate) })
                : undefined
            }
            muted={profile.wins === 0}
          />
          <StatTile
            icon={Goal}
            label={t("stats.goals")}
            value={String(profile.goals)}
            muted={profile.goals === 0}
          />
          <StatTile
            icon={Handshake}
            label={t("stats.assists")}
            value={String(profile.assists)}
            muted={profile.assists === 0}
          />
          <StatTile
            icon={ShieldCheck}
            label={t("stats.cleanSheets")}
            value={String(profile.cleanSheets)}
            muted={profile.cleanSheets === 0}
          />
          <StatTile
            icon={Star}
            label={t("stats.mvpCount")}
            value={t("stats.mvpCount_value", { count: profile.mvpCount })}
            muted={profile.mvpCount === 0}
          />
          <StatTile
            icon={Flame}
            label={t("stats.currentStreak")}
            value={t("stats.currentStreak_value", { count: profile.currentStreak })}
            hint={
              profile.bestStreak > 0
                ? t("stats.bestStreak", { count: profile.bestStreak })
                : undefined
            }
            muted={profile.currentStreak === 0}
            wide
          />
        </div>
      </div>
    </div>
  );
}
