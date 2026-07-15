import { useTranslation } from "react-i18next";

export function LandingPage() {
  const { t } = useTranslation("landing");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-6xl text-ink uppercase tracking-wide">{t("hero.title")}</h1>
      <p className="mt-4 max-w-md text-balance text-lg text-muted">{t("hero.tagline")}</p>
      <p className="mt-8 text-muted/70 text-sm">{t("hero.note")}</p>
    </main>
  );
}
