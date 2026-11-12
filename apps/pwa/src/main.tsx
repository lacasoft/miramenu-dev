import "@miramenu/tokens/tokens.css";
import "./styles/global.css";
import { createDinerApi } from "@miramenu/api-client";
import { siteAddressOf } from "@miramenu/diner-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DinerApiContext } from "./app/api-context";
import { App } from "./app/App";
import { createQueryClient } from "./app/query-client";
import { parsePwaConfig } from "./config";
import { t } from "./i18n";
import { fetchTransport } from "./platform/fetch-transport";

const config = parsePwaConfig(import.meta.env);
const api = createDinerApi({
  baseUrl: config.apiUrl,
  transport: fetchTransport,
});
const address = siteAddressOf(window.location, config.siteHostname);

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");

document.title = t("app.title");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <DinerApiContext value={api}>
        <App address={address} feedTimings={config.feed} />
      </DinerApiContext>
    </QueryClientProvider>
  </StrictMode>,
);
