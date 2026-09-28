import { COLORS } from "./constants";

export function createPixelRect(k, position, width, height, color, outline = COLORS.brown) {
  return k.add([
    k.pos(position),
    k.rect(width, height),
    k.color(k.Color.fromHex(color)),
    k.outline(4, k.Color.fromHex(outline)),
    k.anchor("center"),
  ]);
}

export function createLabel(k, text, position, options = {}) {
  const textOptions = { size: options.size ?? 18, font: "monospace" };
  if (options.width) textOptions.width = options.width;
  if (options.align) textOptions.align = options.align;
  return k.add([
    k.text(text, textOptions),
    k.pos(position),
    k.color(k.Color.fromHex(options.color ?? COLORS.brown)),
    k.anchor("center"),
    k.z(10),
  ]);
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
