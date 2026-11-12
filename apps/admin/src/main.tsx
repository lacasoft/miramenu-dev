import "@miramenu/tokens/tokens.css";
import "./styles/global.css";
import { createAdminApi } from "@miramenu/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApiContext } from "./app/api-context";
import { App } from "./app/App";
import { createQueryClient } from "./app/query-client";
import { parseAdminConfig } from "./config";
import { t } from "./i18n";
import { fetchTransport } from "./platform/fetch-transport";

const config = parseAdminConfig(import.meta.env);
const api = createAdminApi({ baseUrl: config.apiUrl, transport: fetchTransport });

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");

document.title = t("app.title");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <AdminApiContext value={api}>
        <App />
      </AdminApiContext>
    </QueryClientProvider>
  </StrictMode>,
);
