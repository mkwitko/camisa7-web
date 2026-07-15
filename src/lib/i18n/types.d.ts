import "i18next";
import type common from "../../../public/locales/pt-BR/common.json";
import type invite from "../../../public/locales/pt-BR/invite.json";
import type landing from "../../../public/locales/pt-BR/landing.json";
import type zod from "../../../public/locales/pt-BR/zod.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      zod: typeof zod;
      invite: typeof invite;
      landing: typeof landing;
    };
  }
}
