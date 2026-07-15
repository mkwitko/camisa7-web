import { env } from "@/env";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mockPublicProfile } from "../../../test/mocks/handlers";
import { server } from "../../../test/mocks/server";
import { renderWithProviders } from "../../../test/utils/render";
import { PlayerProfileContent } from "./player-profile-content";

const api = (path: string) => `${env.VITE_API_URL}${path}`;

describe("PlayerProfileContent", () => {
  afterEach(() => {
    // @ts-expect-error — navigator.share isn't typed as configurable in jsdom's lib.
    navigator.share = undefined;
  });

  test("renders the player card from the public profile", async () => {
    renderWithProviders(<PlayerProfileContent playerId={mockPublicProfile.playerId} />);

    expect(await screen.findByText(mockPublicProfile.name)).toBeInTheDocument();
    expect(screen.getByText(String(mockPublicProfile.bestOverall))).toBeInTheDocument();
    expect(screen.getByText(/nível ouro/i)).toBeInTheDocument();
    expect(screen.getByText(String(mockPublicProfile.matchesPlayed))).toBeInTheDocument();
    expect(screen.getByText(String(mockPublicProfile.goals))).toBeInTheDocument();

    await vi.waitFor(() => expect(document.title).toBe(`${mockPublicProfile.name} · Futebol`));
  });

  test("shows the share button and falls back to copy-link without Web Share API", async () => {
    renderWithProviders(<PlayerProfileContent playerId={mockPublicProfile.playerId} />);
    await screen.findByText(mockPublicProfile.name);

    expect(screen.getByRole("button", { name: /copiar link/i })).toBeInTheDocument();
  });

  test("uses navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: shareMock });

    renderWithProviders(<PlayerProfileContent playerId={mockPublicProfile.playerId} />);
    await screen.findByText(mockPublicProfile.name);

    expect(screen.getByRole("button", { name: /compartilhar/i })).toBeInTheDocument();
  });

  test("shows a friendly not-found screen on 404 (guest/unknown player)", async () => {
    server.use(
      http.get(api("/players/:playerId/public-profile"), () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<PlayerProfileContent playerId="unknown-player" />);

    expect(await screen.findByText(/jogador não encontrado/i)).toBeInTheDocument();
  });

  test("shows a generic error screen with retry for non-404 failures", async () => {
    server.use(
      http.get(api("/players/:playerId/public-profile"), () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<PlayerProfileContent playerId={mockPublicProfile.playerId} />);

    expect(await screen.findByText(/não deu pra carregar o perfil/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });
});
