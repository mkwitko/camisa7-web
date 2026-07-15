import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterAll, afterEach, beforeAll } from "vitest";
import common from "../public/locales/pt-BR/common.json";
import invite from "../public/locales/pt-BR/invite.json";
import landing from "../public/locales/pt-BR/landing.json";
import profile from "../public/locales/pt-BR/profile.json";
import zod from "../public/locales/pt-BR/zod.json";
import { server } from "./mocks/server";

// Real, synchronous i18n with embedded resources — no HTTP backend in tests.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "pt-BR",
    fallbackLng: "pt-BR",
    ns: ["common", "zod", "invite", "landing", "profile"],
    defaultNS: "common",
    resources: { "pt-BR": { common, zod, invite, landing, profile } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

// jsdom doesn't implement clipboard — stub it so copy-to-clipboard tests can run.
Object.assign(navigator, {
  clipboard: { writeText: async () => undefined },
});
