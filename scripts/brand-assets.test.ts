import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const webRequire = createRequire(resolve(root, "web/package.json"));
const sharp = webRequire("sharp") as typeof import("../web/node_modules/sharp");
const { SaxesParser } = webRequire(
  "saxes",
) as typeof import("../web/node_modules/saxes");
const svg = readFileSync(resolve(root, "web/app/icon.svg"));
const brass = [255, 179, 35];
const ink = [42, 28, 0];

function svgElements() {
  const parser = new SaxesParser({ xmlns: false });
  const elements: {
    name: string;
    attributes: Record<string, string>;
    parent: number | undefined;
  }[] = [];
  const ancestors: number[] = [];
  parser.on("opentag", (tag) => {
    elements.push({ ...tag, parent: ancestors.at(-1) });
    ancestors.push(elements.length - 1);
  });
  parser.on("closetag", () => ancestors.pop());
  parser.on("doctype", () => {
    throw new Error("The brand SVG must not declare external entities");
  });
  parser.on("processinginstruction", () => {
    throw new Error("The brand SVG must be self-contained");
  });
  parser.write(svg.toString("utf8")).close();
  return elements;
}

async function inspectTile(input: Buffer, size: number, color: number[]) {
  const { data, info } = await sharp(input)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(4);
  let painted = 0;
  let face = 0;
  let dark = 0;
  let borderAlpha = 0;
  let leftFaceTop = size;
  let rightFaceTop = size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const alpha = data[offset + 3];
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1)
        borderAlpha = Math.max(borderAlpha, alpha);
      if (alpha !== 255) continue;
      painted++;
      if (color.every((value, channel) => data[offset + channel] === value)) {
        face++;
        if (x === Math.floor(size * 0.25))
          leftFaceTop = Math.min(leftFaceTop, y);
        if (x === Math.floor(size * 0.65))
          rightFaceTop = Math.min(rightFaceTop, y);
      }
      if (ink.every((value, channel) => data[offset + channel] === value))
        dark++;
    }
  }
  expect(borderAlpha, `The ${size}px tile must not touch the canvas edge`).toBe(
    0,
  );
  expect(painted / (size * size)).toBeGreaterThan(0.45);
  expect(painted / (size * size)).toBeLessThan(0.8);
  expect(
    face / (size * size),
    "The tile face must remain visible",
  ).toBeGreaterThan(0.2);
  expect(
    dark / (size * size),
    "The solid outline and shadow must remain visible",
  ).toBeGreaterThan(0.08);
  expect(leftFaceTop).toBeLessThan(size);
  expect(
    rightFaceTop,
    "The tile face must tilt upward to the right",
  ).toBeLessThan(leftFaceTop);
}

describe("brand assets", () => {
  it("keeps a self-contained, tilted SVG tile with a solid shadow and complete mascot", () => {
    const elements = svgElements();
    expect(elements[0].name).toBe("svg");
    expect(elements[0].attributes).toMatchObject({
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 64 64",
    });
    const allowedAttributes = new Set([
      "xmlns",
      "viewBox",
      "transform",
      "x",
      "y",
      "width",
      "height",
      "rx",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "d",
    ]);
    for (const element of elements) {
      expect(["svg", "g", "rect", "path"]).toContain(element.name);
      for (const [name, value] of Object.entries(element.attributes)) {
        expect(
          allowedAttributes.has(name),
          `Unexpected SVG attribute: ${name}`,
        ).toBe(true);
        expect(value).not.toMatch(/url\s*\(/i);
        if (name === "fill" || name === "stroke")
          expect(["none", "#ffb323", "#2a1c00"]).toContain(value);
      }
    }

    const tiltedIndex = elements.findIndex((element) =>
      /^rotate\(/.test(element.attributes.transform ?? ""),
    );
    expect(tiltedIndex).toBeGreaterThan(0);
    const angle = Number(
      elements[tiltedIndex].attributes.transform.match(
        /^rotate\(\s*([-\d.]+)/,
      )?.[1],
    );
    expect(angle).toBeLessThan(-1);
    expect(angle).toBeGreaterThan(-15);
    const tiles = elements.filter(
      (element) => element.parent === tiltedIndex && element.name === "rect",
    );
    expect(tiles).toHaveLength(2);
    const [shadow, face] = tiles.map((element) => element.attributes);
    expect(shadow.fill).toBe("#2a1c00");
    expect(face.fill).toBe("#ffb323");
    expect(face.stroke).toBe("#2a1c00");
    expect(Number(face["stroke-width"])).toBeGreaterThan(0);
    expect(shadow.width).toBe(face.width);
    expect(shadow.height).toBe(face.height);
    expect(face.width).toBe(face.height);
    for (const axis of ["x", "y"]) {
      const offset = Number(shadow[axis]) - Number(face[axis]);
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(Number(face.width) / 3);
    }
    const glyphIndex = elements.findIndex(
      (element) => element.parent === tiltedIndex && element.name === "g",
    );
    const glyph = elements.filter((element) => element.parent === glyphIndex);
    expect(glyph.filter((element) => element.name === "path")).toHaveLength(3);
    expect(glyph.filter((element) => element.name === "rect")).toHaveLength(1);
    expect(
      glyph.filter(
        (element) => element.attributes["stroke-linecap"] === "round",
      ),
    ).toHaveLength(2);
  });

  it("keeps the favicon and README renderings inside a transparent canvas", async () => {
    for (const size of [32, 64, 112]) await inspectTile(svg, size, brass);
  });

  it("ships transparent native PNGs at the declared icon sizes", async () => {
    for (const [file, size] of [
      ["32x32.png", 32],
      ["128x128.png", 128],
      ["128x128@2x.png", 256],
      ["icon.png", 512],
    ] as const) {
      const image = readFileSync(resolve(root, "src-tauri/icons", file));
      expect(await sharp(image).metadata()).toMatchObject({
        format: "png",
        width: size,
        height: size,
        hasAlpha: true,
      });
      await inspectTile(image, size, brass);
    }
  });

  it("preserves distinct tray status colors and an unclipped tile", async () => {
    for (const [status, color] of [
      ["idle", brass],
      ["good", [34, 197, 94]],
      ["warn", [249, 115, 22]],
      ["bad", [239, 68, 68]],
    ] as const) {
      const image = readFileSync(
        resolve(root, `src-tauri/icons/tray-${status}.png`),
      );
      expect(await sharp(image).metadata()).toMatchObject({
        format: "png",
        width: 64,
        height: 64,
        hasAlpha: true,
      });
      await inspectTile(image, 64, [...color]);
    }
  });

  it("ships a valid PNG-backed Windows ICO matching the native 256px icon", async () => {
    const ico = readFileSync(resolve(root, "src-tauri/icons/icon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThan(0);
    expect(6 + count * 16).toBeLessThan(ico.length);
    let end = 6 + count * 16;
    const sizes: number[] = [];
    for (let index = 0; index < count; index++) {
      const entry = 6 + index * 16;
      const width = ico[entry] || 256;
      const height = ico[entry + 1] || 256;
      expect(ico[entry + 2]).toBe(0);
      expect(ico[entry + 3]).toBe(0);
      expect(ico.readUInt16LE(entry + 4)).toBe(1);
      expect(ico.readUInt16LE(entry + 6)).toBe(32);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(offset).toBeGreaterThanOrEqual(end);
      end = offset + length;
      expect(end).toBeLessThanOrEqual(ico.length);
      const payload = ico.subarray(offset, end);
      expect(payload.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(await sharp(payload).metadata()).toMatchObject({
        format: "png",
        width,
        height,
        hasAlpha: true,
      });
      expect(width).toBe(height);
      sizes.push(width);
      if (width === 256) {
        const png = readFileSync(
          resolve(root, "src-tauri/icons/128x128@2x.png"),
        );
        expect(
          (await sharp(payload).raw().toBuffer()).equals(
            await sharp(png).raw().toBuffer(),
          ),
          "The ICO and native 256px PNG must contain the same pixels",
        ).toBe(true);
      }
    }
    expect(sizes).toContain(256);
    expect(end).toBe(ico.length);
  });

  it("uses the canonical SVG as the README logo", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const logo = readme.match(/<img\b[^>]*>/i)?.[0];
    expect(logo).toMatch(/\bsrc="web\/app\/icon\.svg"/);
    expect(logo).toMatch(/\bwidth="112"/);
    expect(logo).toMatch(/\bheight="112"/);
  });
});
