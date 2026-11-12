// What the admin's screens need from the page between tests.
import { afterEach } from "vitest";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});
