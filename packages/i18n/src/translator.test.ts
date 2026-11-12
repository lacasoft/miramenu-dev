import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminMessages } from "./admin/es-MX.ts";
import { createTranslator } from "./translator.ts";

const t = createTranslator({
  plain: "Cargando el menú",
  named: "Ver detalle de {name}",
  several: "{name}: {count} me gusta, {count} en total",
});

describe("createTranslator", () => {
  it("returns the text of a key", () => {
    assert.equal(t("plain"), "Cargando el menú");
  });

  it("puts each value in its placeholders, every time it appears", () => {
    assert.equal(
      t("named", { name: "Taco de pastor" }),
      "Ver detalle de Taco de pastor",
    );
    assert.equal(
      t("several", { name: "Suadero", count: 3 }),
      "Suadero: 3 me gusta, 3 en total",
    );
  });

  it("never reads a value as a pattern", () => {
    assert.equal(
      t("named", { name: "$& {count}" }),
      "Ver detalle de $& {count}",
    );
  });

  it("checks keys and values at compile time", () => {
    // @ts-expect-error: a key that is not in the catalog
    assert.throws(() => t("missing"));
    // @ts-expect-error: a text with placeholders needs its values
    assert.equal(t("named"), "Ver detalle de {name}");
    // @ts-expect-error: a text without placeholders takes none
    assert.equal(t("plain", { name: "x" }), "Cargando el menú");
  });
});

describe("the admin's catalog", () => {
  const admin = createTranslator(adminMessages);

  it("fills its placeholders, and its keys are checked like the diner's", () => {
    assert.equal(admin("shell.greeting", { name: "Ana" }), "Hola, Ana");
    assert.equal(admin("signIn.wait", { seconds: 42 }), "Demasiados intentos. Vuelve a intentar en 42 s.");
    // @ts-expect-error: the diner's keys are not the admin's
    assert.throws(() => admin("menu.loading"));
  });
});
