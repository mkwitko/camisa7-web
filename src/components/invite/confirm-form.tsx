import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ConfirmInviteInput, confirmInviteSchema } from "@/schemas/invite/confirm.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

type Props = {
  isSubmitting?: boolean;
  onSubmit: (values: ConfirmInviteInput) => void | Promise<void>;
};

export function ConfirmForm({ isSubmitting, onSubmit }: Props) {
  const { t } = useTranslation("invite");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmInviteInput>({
    resolver: zodResolver(confirmInviteSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { name: "", phone: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="confirm-name" className="mb-1.5 block font-medium text-ink text-sm">
          {t("form.fields.name")}
        </label>
        <Input
          id="confirm-name"
          autoComplete="name"
          invalid={!!errors.name}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "confirm-name-error" : undefined}
          placeholder={t("form.placeholders.name")}
          {...register("name")}
        />
        {errors.name && (
          <p id="confirm-name-error" className="mt-1.5 text-danger text-sm">
            {t(errors.name.message as unknown as never)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="confirm-phone" className="mb-1.5 block font-medium text-ink text-sm">
          {t("form.fields.phone")}
        </label>
        <Input
          id="confirm-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("form.placeholders.phone")}
          {...register("phone")}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("form.submitting") : t("form.submit")}
      </Button>
    </form>
  );
}
