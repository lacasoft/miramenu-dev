import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { actor, business, fakeAdminApi, here, id, renderAdmin } from "../test/fake-admin";
import { branchOf, type World } from "../test/fake-world";

const LA_FONDA = id(10);
const CENTRO = id(11);
const world = (): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro", "fondacentro"), branchOf(12, LA_FONDA, "Norte", "norte")],
  users: [],
  mailWorks: true,
});
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** What the page handed the browser to save: each blob and the name it went under. */
function capturedDownloads() {
  const saved: { blob: Blob; name: string }[] = [];
  const blobs = new Map<string, Blob>();
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (blob !== undefined) saved.push({ blob, name: this.download });
  });
  return saved;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(cleanup);

describe("a branch", () => {
  it("shows its address and its QR code, and leads back to its business", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Centro" })).toBeTruthy();
    const address = screen.getByRole("link", { name: "https://fondacentro.example.test/" });
    expect(address.getAttribute("target")).toBe("_blank");
    expect(address.getAttribute("rel")).toBe("noreferrer");
    const code = await screen.findByRole("img", { name: t("qr.image", { name: "Centro" }) });
    expect(code.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    // Four light modules all around: the quiet zone scanners need.
    const size = Number(code.getAttribute("viewBox")?.split(" ")[2]);
    const corners = [...(code.querySelector("path")?.getAttribute("d") ?? "").matchAll(/M(\d+) (\d+)h(\d+)/g)];
    expect(Math.min(...corners.map(([, , y]) => Number(y)))).toBe(4);
    expect(Math.min(...corners.map(([, x]) => Number(x)))).toBe(4);
    expect(Math.max(...corners.map(([, x, , width]) => Number(x) + Number(width)))).toBe(size - 4);
    expect(screen.getAllByText("https://mirame.example.test/a2b3c4d").length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole("link", { name: t("common.backTo", { name: "La Fonda" }) }));
    expect(here()).toBe(`/businesses/${LA_FONDA}`);
  });

  it("downloads the code as an SVG with its title, and as a PNG", async () => {
    const saved = capturedDownloads();
    const fill = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: fill,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(callback) {
      callback(new Blob(["png"], { type: "image/png" }));
    });
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);

    fireEvent.click(await screen.findByRole("button", { name: t("qr.downloadSvg") }));
    expect(saved[0]?.name).toBe("qr-centro.svg");
    expect(saved[0]?.blob.type).toBe("image/svg+xml");
    const svg = await saved[0]?.blob.text();
    expect(svg).toContain(`<title>${t("qr.image", { name: "Centro" })}</title>`);
    expect(svg).toMatch(/<path d="M\d+ \d+h\d+v1h-\d+z/);

    fireEvent.click(screen.getByRole("button", { name: t("qr.downloadPng") }));
    await vi.waitFor(() => expect(saved[1]?.name).toBe("qr-centro.png"));
    expect(saved[1]?.blob.type).toBe("image/png");
    // The white page first, then one square per dark module.
    expect(fill.mock.calls.length).toBeGreaterThan(100);
  });

  it("says so when the browser cannot draw the PNG, and prints the code", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);

    fireEvent.click(await screen.findByRole("button", { name: t("qr.downloadPng") }));
    expect((await screen.findByRole("alert")).textContent).toBe(t("qr.pngFailed"));
    fireEvent.click(screen.getByRole("button", { name: t("qr.print") }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("lets its business's admin change it, and an emptied subdomain removes its own", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);
    fireEvent.click(await screen.findByRole("button", { name: t("branch.edit") }));

    type(t("branch.slug"), "norte");
    fireEvent.click(screen.getByRole("button", { name: t("common.save") }));
    expect(await screen.findByText(t("field.slug.taken"))).toBeTruthy();
    type(t("branch.slug"), "centro");
    type(t("branch.ownSubdomain"), "");
    fireEvent.click(screen.getByRole("button", { name: t("common.save") }));

    expect(await screen.findByText(t("branch.usesBusinessSubdomain"))).toBeTruthy();
    expect(api.updateBranch).toHaveBeenLastCalledWith(CENTRO, { subdomain: null });
    expect(screen.getByRole("status").textContent).toContain(t("branch.saved"));
  });

  it("shows a branch admin its QR code, with nothing to change", async () => {
    const branchAdmin = actor([{ businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" }]);
    const { api } = fakeAdminApi({ signedIn: branchAdmin, world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);
    expect(await screen.findByRole("img", { name: t("qr.image", { name: "Centro" }) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("branch.edit") })).toBeNull();

    cleanup();
    renderAdmin(fakeAdminApi({ signedIn: branchAdmin, world: world() }).api, `/branches/${id(12)}`);
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeTruthy();
  });
});
