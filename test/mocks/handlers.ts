import type { GetPublicProfile200 } from "@/api/generated/types/GetPublicProfile";
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

export const mockPublicProfile: GetPublicProfile200 = {
  playerId: "44444444-4444-4444-8444-444444444444",
  name: "Zico Nogueira",
  level: "ouro",
  overallByPosition: { atacante: 87, meia: 79 },
  bestOverall: 87,
  bestPosition: "atacante",
  matchesPlayed: 274,
  wins: 132,
  draws: 91,
  losses: 51,
  winRate: 0.4818,
  goals: 418,
  assists: 96,
  cleanSheets: 12,
  mvpCount: 27,
  currentStreak: 6,
  bestStreak: 14,
};

export const handlers = [
  http.get(api("/invite/:token"), () => {
    return HttpResponse.json(mockInvite);
  }),

  http.post(api("/invite/confirm"), () => {
    return HttpResponse.json(mockConfirmedResult, { status: 201 });
  }),

  http.get(api("/players/:playerId/public-profile"), () => {
    return HttpResponse.json(mockPublicProfile);
  }),
];
