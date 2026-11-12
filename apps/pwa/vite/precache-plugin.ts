import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** The free name the worker reads its precache from (src/sw/sw.ts). */
export const PRECACHE_PLACEHOLDER = "__MIRAMENU_PRECACHE__";

/** Fixed, at the root: the worker's scope is the whole site, and its URL never changes. */
export const WORKER_FILE = "sw.js";

const WORKER_ENTRY = fileURLToPath(new URL("../src/sw/sw.ts", import.meta.url));

type BundleFile =
  | { type: "asset"; source: string | Uint8Array }
  | { type: "chunk"; code: string };

/**
 * The files the worker keeps and their version. The version comes from the content of the
 * build, so only a real change installs a new worker, as in the demo.
 */
export function precacheOf(bundle: Readonly<Record<string, BundleFile>>) {
  const names = Object.keys(bundle)
    .filter((name) => name !== WORKER_FILE && !name.endsWith(".map"))
    .sort();
  const hash = createHash("sha256");
  for (const name of names) {
    const file = bundle[name];
    if (file)
      hash.update(name).update(file.type === "asset" ? file.source : file.code);
  }
  return {
    version: hash.digest("hex").slice(0, 16),
    files: names.map((name) => `/${name}`),
  };
}

/**
 * Builds src/sw/sw.ts as one more entry, to /sw.js, and writes into it the build's files
 * and version (ADR-0046). It fails the build rather than ship a worker that would not
 * work: one that imports other chunks (a classic worker cannot), or one with nowhere to
 * write its files.
 */
export function precachePlugin({
  entry = WORKER_ENTRY,
}: { entry?: string } = {}): Plugin {
  return {
    name: "miramenu-precache",
    apply: "build",
    enforce: "post",
    buildStart() {
      this.emitFile({ type: "chunk", id: entry, fileName: WORKER_FILE });
    },
    generateBundle(_options, bundle) {
      const worker = bundle[WORKER_FILE];
      if (worker?.type !== "chunk") this.error(`${WORKER_FILE} was not built`);
      const imported = [...worker.imports, ...worker.dynamicImports];
      if (imported.length > 0)
        this.error(
          `${WORKER_FILE} must be a single file, but it imports ${imported.join(", ")}`,
        );
      if (!worker.code.includes(PRECACHE_PLACEHOLDER))
        this.error(`${WORKER_FILE} never reads ${PRECACHE_PLACEHOLDER}`);
      const precache = precacheOf(
        bundle as unknown as Record<string, BundleFile>,
      );
      worker.code = worker.code.replaceAll(
        PRECACHE_PLACEHOLDER,
        JSON.stringify(precache),
      );
    },
  };
}
