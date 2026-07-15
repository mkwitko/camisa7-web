import type { ApiError } from "@/api/client";
import { usePublicConfirm } from "@/api/generated/hooks/invitesHooks/usePublicConfirm";
import { useResolveInvite } from "@/api/generated/hooks/invitesHooks/useResolveInvite";
import type { PublicConfirmMutationResponse } from "@/api/generated/types/PublicConfirm";
import { ConfirmForm } from "@/components/invite/confirm-form";
import { ConfirmResult } from "@/components/invite/confirm-result";
import { InviteErrorState } from "@/components/invite/invite-error-state";
import { InviteSkeleton } from "@/components/invite/invite-skeleton";
import { PeladaCard } from "@/components/invite/pelada-card";
import { InlineMessage } from "@/components/ui/inline-message";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function InvitePageContent({ token }: { token: string }) {
  const { t } = useTranslation("invite");
  const { data: invite, error, isLoading, refetch } = useResolveInvite(token);
  const [confirmResult, setConfirmResult] = useState<PublicConfirmMutationResponse | null>(null);

  const {
    mutate: confirm,
    isPending,
    error: confirmError,
  } = usePublicConfirm({
    mutation: {
      onSuccess: (data) => setConfirmResult(data),
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <p className="font-display text-2xl text-primary uppercase tracking-wide">futebol</p>
      </header>

      {isLoading && <InviteSkeleton />}

      {!isLoading && error && (
        <InviteErrorState
          variant={(error as ApiError).status === 404 ? "invalidToken" : "generic"}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && invite && (
        <div className="space-y-6">
          <PeladaCard invite={invite} />

          {confirmResult ? (
            <ConfirmResult result={confirmResult} pixKey={invite.pixKey} />
          ) : (
            <section className="rounded-lg border border-line bg-surface p-6">
              <h2 className="mb-4 font-display text-ink text-xl uppercase tracking-wide">
                {t("form.title")}
              </h2>
              {confirmError && (
                <InlineMessage className="mb-4">{t("error.confirmFailed")}</InlineMessage>
              )}
              <ConfirmForm
                isSubmitting={isPending}
                onSubmit={(values) =>
                  confirm({
                    data: {
                      token,
                      name: values.name,
                      ...(values.phone ? { phone: values.phone } : {}),
                    },
                  })
                }
              />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
