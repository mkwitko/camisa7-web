import type { ResolveInviteQueryResponse } from "@/api/generated/types/ResolveInvite";
import { StatusBadge } from "@/components/invite/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/hooks/common/use-format";
import { MapPin, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  invite: ResolveInviteQueryResponse;
};

export function PeladaCard({ invite }: Props) {
  const { t } = useTranslation("invite");
  const f = useFormat();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{invite.groupName}</CardTitle>
          <p className="mt-1 text-muted text-sm capitalize">{f.matchDateTime(invite.datetime)}</p>
        </div>
        <StatusBadge status={invite.status} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-ink text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{invite.location}</span>
        </div>

        <div className="flex items-center justify-between rounded-md bg-surface-up px-4 py-3">
          <div className="flex items-center gap-2 text-ink text-sm">
            <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {t("card.vagas", { confirmed: invite.confirmedCount, slots: invite.slots })}
            </span>
          </div>
          <span className="font-display text-2xl text-primary">
            {f.currency(invite.priceCents)}
          </span>
        </div>

        {invite.waitlistCount > 0 && (
          <p className="text-muted text-sm">
            {t("card.waitlist", { count: invite.waitlistCount })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
