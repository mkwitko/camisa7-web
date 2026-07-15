import { render, screen } from "@testing-library/react";
import i18n from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  test("shows the brand and tagline", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LandingPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole("heading", { name: /futebol/i })).toBeInTheDocument();
    expect(screen.getByText(/organize peladas/i)).toBeInTheDocument();
  });
});
