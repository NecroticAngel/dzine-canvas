/**
 * Convert a CSS colour to the `#rrggbb` form two unrelated things insist on.
 *
 * `<input type="color">` takes nothing else, which is obvious enough. Less
 * obvious: `qrcode`'s canvas renderer parses the colour itself and throws
 * `Invalid hex color: rgb(30, 30, 45)` on anything that is not hex. Since layer
 * colours are stored as `rgb(r, g, b)` — that is what the colour inputs and the
 * presets produce — every call into that library has to convert first.
 *
 * Both of those callers used to have their own slightly different copy, which
 * is how the QR panel's thumbnails ended up passing `rgb()` straight through
 * and rendering blank codes. One implementation, used by both.
 *
 * Alpha is deliberately dropped: a QR code is drawn onto an opaque plate, and
 * the colour inputs are all six-digit.
 */
export const colorToHex = (value: unknown, fallback: string): string => {
  const raw = String(value ?? '').trim();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;

  const match = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return fallback;
  const hex = (part: string) =>
    Math.min(255, Number(part)).toString(16).padStart(2, '0');
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
};
