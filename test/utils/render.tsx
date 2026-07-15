import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement } from "react";

type Options = RenderOptions & {
  queryClient?: QueryClient;
};

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const queryClient =
    opts.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, staleTime: 0 },
        mutations: { retry: false },
      },
    });

  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, opts),
    queryClient,
  };
}
