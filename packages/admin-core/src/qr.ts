/** A QR code's modules, row by row: true for a dark one. Borders included. */
export type QrModules = readonly (readonly boolean[])[];

/**
 * The dark modules as one SVG path in module units, each horizontal run of dark modules
 * a single rectangle: fewer segments than one square per module, the same picture.
 */
export function qrPathOf(modules: QrModules): string {
  const segments: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      segments.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return segments.join("");
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The code as a standalone SVG file to download and print: black on white, with crisp
 * edges and its title, sized so one module is `moduleSize` units.
 */
export function qrSvgOf(modules: QrModules, title: string, moduleSize = 10): string {
  const size = modules.length;
  const side = size * moduleSize;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${side}" height="${side}" shape-rendering="crispEdges">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="${size}" height="${size}" fill="#FFFFFF"/>`,
    `<path d="${qrPathOf(modules)}" fill="#000000"/>`,
    "</svg>",
  ].join("");
}

/** The download's file name, from the branch's slug: `qr-centro.svg`. */
export const qrFileNameOf = (slug: string, extension: "svg" | "png"): string =>
  `qr-${slug}.${extension}`;
