import "@fontsource/saira-condensed/500.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource-variable/hanken-grotesk";
import "@/styles/globals.css";

import { queryClient } from "@/api/query-client";
import { i18n, initI18n } from "@/lib/i18n";
import { router } from "@/router";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

initI18n().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>,
  );
});
