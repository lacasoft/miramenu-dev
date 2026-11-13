import type { QrModules } from "@miramenu/admin-core";

/** Hands a file to the browser to save under this name. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked once the browser took it; revoking at once can cancel the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The code as a PNG, `moduleSize` pixels a module, black on white. */
export function pngOf(modules: QrModules, moduleSize = 16): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = modules.length * moduleSize;
  canvas.height = modules.length * moduleSize;
  const context = canvas.getContext("2d");
  if (context === null) return Promise.reject(new Error("2d canvas unavailable"));
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
    }),
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob === null ? reject(new Error("no PNG produced")) : resolve(blob)), "image/png"),
  );
}
