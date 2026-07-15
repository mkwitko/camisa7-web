import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

export const DEFAULT_LANGUAGE = "pt-BR";
export const NAMESPACES = ["common", "zod", "invite", "landing"] as const;

export async function initI18n() {
  if (i18n.isInitialized) return i18n; // idempotent (StrictMode calls twice)

  await i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [DEFAULT_LANGUAGE],
      ns: NAMESPACES,
      defaultNS: "common",
      backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    });

  return i18n;
}

export { default as i18n } from "i18next";
