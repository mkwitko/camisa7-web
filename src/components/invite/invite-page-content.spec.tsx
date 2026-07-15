import { env } from "@/env";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { mockInvite } from "../../../test/mocks/handlers";
import { server } from "../../../test/mocks/server";
import { renderWithProviders } from "../../../test/utils/render";
import { InvitePageContent } from "./invite-page-content";

const api = (path: string) => `${env.VITE_API_URL}${path}`;

describe("InvitePageContent", () => {
  test("renders the pelada from resolveInvite", async () => {
    renderWithProviders(<InvitePageContent token="valid-token" />);

    expect(await screen.findByText(mockInvite.groupName)).toBeInTheDocument();
    expect(screen.getByText(mockInvite.location)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?25,00/)).toBeInTheDocument();
    expect(screen.getByText(/8 de 14 vagas confirmadas/)).toBeInTheDocument();
  });

  test("validates empty name before submitting", async () => {
    renderWithProviders(<InvitePageContent token="valid-token" />);
    await screen.findByText(mockInvite.groupName);

    await userEvent.click(screen.getByRole("button", { name: /confirmar presença/i }));

    expect(await screen.findByText(/digite seu nome para confirmar/i)).toBeInTheDocument();
  });

  test("submits the form and shows the confirmed result with the PIX key", async () => {
    renderWithProviders(<InvitePageContent token="valid-token" />);
    await screen.findByText(mockInvite.groupName);

    await userEvent.type(screen.getByLabelText(/seu nome/i), "Alice");
    await userEvent.click(screen.getByRole("button", { name: /confirmar presença/i }));

    expect(await screen.findByText(/presença confirmada/i)).toBeInTheDocument();
    expect(screen.getByText(mockInvite.pixKey as string)).toBeInTheDocument();
  });

  test("shows the waitlist state when the API returns waitlisted", async () => {
    server.use(
      http.post(api("/invite/confirm"), () =>
        HttpResponse.json(
          {
            attendanceId: "33333333-3333-4333-8333-333333333333",
            status: "waitlisted",
            waitlistPos: 3,
          },
          { status: 201 },
        ),
      ),
    );

    renderWithProviders(<InvitePageContent token="valid-token" />);
    await screen.findByText(mockInvite.groupName);

    await userEvent.type(screen.getByLabelText(/seu nome/i), "Bob");
    await userEvent.click(screen.getByRole("button", { name: /confirmar presença/i }));

    expect(await screen.findByText(/você entrou na fila \(posição 3\)/i)).toBeInTheDocument();
  });

  test("shows the invalid/expired invite screen on 404", async () => {
    server.use(
      http.get(api("/invite/:token"), () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );

    renderWithProviders(<InvitePageContent token="expired-token" />);

    expect(await screen.findByText(/convite inválido ou expirado/i)).toBeInTheDocument();
  });
});
