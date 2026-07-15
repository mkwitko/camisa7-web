import { z } from "zod";

// Messages are i18n keys (`namespace:path`), translated by the form component.
export const confirmInviteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "invite:form.errors.name.required" })
    .max(120, { message: "invite:form.errors.name.required" }),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export type ConfirmInviteInput = z.infer<typeof confirmInviteSchema>;
