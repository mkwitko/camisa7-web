import type { PublicConfirmMutationResponse } from "@/api/generated/types/PublicConfirm";
import type { ResolveInviteQueryResponse } from "@/api/generated/types/ResolveInvite";
import { env } from "@/env";
import { http, HttpResponse } from "msw";

const api = (path: string) => `${env.VITE_API_URL}${path}`;

export const mockInvite: ResolveInviteQueryResponse = {
  matchId: "11111111-1111-4111-8111-111111111111",
  groupName: "Pelada dos Crias",
  datetime: "2026-07-22T23:00:00.000Z",
  location: "Quadra do Bairro Alto",
  priceCents: 2500,
  slots: 14,
  pixKey: "pelada@exemplo.com",
  status: "open",
  confirmedCount: 8,
  waitlistCount: 0,
};

export const mockConfirmedResult: PublicConfirmMutationResponse = {
  attendanceId: "22222222-2222-4222-8222-222222222222",
  status: "confirmed",
  waitlistPos: null,
};

export const handlers = [
  http.get(api("/invite/:token"), () => {
    return HttpResponse.json(mockInvite);
  }),

  http.post(api("/invite/confirm"), () => {
    return HttpResponse.json(mockConfirmedResult, { status: 201 });
  }),
];
