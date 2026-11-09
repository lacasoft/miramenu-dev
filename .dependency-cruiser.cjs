/**
 * Architecture boundaries of Miramenu, taken from CLAUDE.project.md
 * ("Contextos y propiedad" and "Restricciones de arquitectura").
 * Each rule names the boundary it protects. Runs in `npm run lint` (script `lint:arch`).
 */
const MODULES = "^apps/api/src/modules/";
const PERSISTENCE = "\\.(entity|repository)\\.ts$";

/** Contexts each context may use: the "Usa de otros" column of Contextos y propiedad. */
const allowedContextDependencies = {
  "business-access": [],
  catalog: ["business-access"],
  diners: [],
  interactions: ["catalog", "diners", "business-access"],
  measurement: ["catalog", "business-access", "interactions"],
};

const contexts = Object.keys(allowedContextDependencies);

const contextDependencyRules = contexts
  .map((context) => {
    const allowed = allowedContextDependencies[context];
    const forbidden = contexts.filter(
      (other) => other !== context && !allowed.includes(other),
    );
    return { context, allowed, forbidden };
  })
  .filter(({ forbidden }) => forbidden.length > 0)
  .map(({ context, allowed, forbidden }) => ({
    name: `${context}-uses-only-declared-contexts`,
    severity: "error",
    comment:
      `The ${context} context may only use ${allowed.length > 0 ? allowed.join(", ") : "no other context"} ` +
      '(CLAUDE.project.md → Contextos y propiedad, "Usa de otros").',
    from: { path: `${MODULES}${context}/` },
    to: { path: `${MODULES}(${forbidden.join("|")})/` },
  }));

module.exports = {
  forbidden: [
    ...contextDependencyRules,
    {
      name: "context-public-entry-only",
      severity: "error",
      comment:
        "Another context is used only through its index.ts, never its entities, repositories or internals " +
        "(CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: MODULES,
        pathNot: [`${MODULES}$1/`, `${MODULES}[^/]+/index\\.ts$`],
      },
    },
    {
      name: "context-entry-hides-persistence",
      severity: "error",
      comment:
        "A context's index.ts never exposes its entities or repositories: only the owner touches its tables " +
        "(CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: `${MODULES}[^/]+/index\\.ts$` },
      to: { path: PERSISTENCE },
    },
    {
      name: "controllers-no-persistence",
      severity: "error",
      comment:
        "Controllers hold no business rules: they call services, never entities or repositories " +
        "(CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: "^apps/api/src/.+\\.controller\\.ts$" },
      to: { path: PERSISTENCE },
    },
    {
      name: "pwa-does-not-import-admin",
      severity: "error",
      comment:
        "The diner PWA never loads admin code (ADR-0002; CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: "^apps/pwa/" },
      to: { path: "^apps/admin/" },
    },
    {
      name: "admin-does-not-import-pwa",
      severity: "error",
      comment:
        "The admin app does not import from the PWA; shared logic lives in packages/ (ADR-0024).",
      from: { path: "^apps/admin/" },
      to: { path: "^apps/pwa/" },
    },
    {
      name: "packages-without-dom-renderer",
      severity: "error",
      comment:
        "Shared packages have no DOM: react-dom stays in the apps (ADR-0024; " +
        "CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: "^packages/" },
      to: { path: "(^|/)react-dom(/|$)" },
    },
    {
      name: "packages-without-node-apis",
      severity: "error",
      comment:
        "Shared packages run in the browser and in React Native too: no Node core modules " +
        "outside their tests and build scripts (ADR-0024, ADR-0026).",
      from: {
        path: "^packages/",
        pathNot: ["\\.test\\.ts$", "^packages/[^/]+/scripts/"],
      },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      comment:
        "Dependencies point from the apps to the shared packages, never the other way " +
        "(CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "infrastructure-does-not-import-contexts",
      severity: "error",
      comment:
        "Infrastructure (config, database, HTTP, Redis, storage, mail) serves the contexts and " +
        "never depends on them (CLAUDE.project.md → Restricciones de arquitectura).",
      from: { path: "^apps/api/src/infrastructure/" },
      to: { path: "^apps/api/src/modules/" },
    },
  ],
  options: {
    doNotFollow: { path: "(^|/)node_modules/" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".mjs",
        ".cjs",
        ".json",
      ],
    },
  },
};
