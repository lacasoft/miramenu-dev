import "@miramenu/tokens/tokens.css";
import "./styles/global.css";
import { createDinerApi } from "@miramenu/api-client";
import {
  createEntryOutbox,
  deviceIdOf,
  siteAddressOf,
} from "@miramenu/diner-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DinerApiContext } from "./app/api-context";
import { App } from "./app/App";
import { EntryOutboxContext } from "./app/entry-outbox-context";
import { createQueryClient } from "./app/query-client";
import { parsePwaConfig } from "./config";
import { t } from "./i18n";
import { sendBeacon } from "./platform/beacon";
import { fetchTransport } from "./platform/fetch-transport";
import { indexedDbEntryStore } from "./platform/indexeddb-entry-store";
import { withLastCopy } from "./platform/last-copy-transport";
import { registerServiceWorker } from "./platform/service-worker";
import { localKeyValueStore } from "./platform/local-storage";

const config = parsePwaConfig(import.meta.env);
const deviceId = deviceIdOf(localKeyValueStore(), () => crypto.randomUUID());
const api = createDinerApi({
  baseUrl: config.apiUrl,
  // Offline, the branch and its menu come from their last copy (ADR-0046).
  transport: withLastCopy(fetchTransport),
  deviceId: () => deviceId,
});
const outbox = createEntryOutbox({
  store: indexedDbEntryStore(),
  send: (entries) => api.sendFeedEntries(entries),
  beacon: (entries) => {
    sendBeacon(api.feedEntriesBeacon(entries));
  },
});
const address = siteAddressOf(window.location, config.siteHostname);

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");

document.title = t("app.title");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <DinerApiContext value={api}>
        <EntryOutboxContext value={outbox}>
          <App address={address} feedTimings={config.feed} />
        </EntryOutboxContext>
      </DinerApiContext>
    </QueryClientProvider>
  </StrictMode>,
);

registerServiceWorker(import.meta.env.PROD);
