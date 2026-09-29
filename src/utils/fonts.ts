import type { FontData } from '@lidojs/design-core';
import axios from 'axios';

/**
 * Loading the font faces a design actually uses.
 *
 * The catalogue was already being fetched, and then thrown away: `getFonts` is
 * declared in the editor's config and never called by it, no `@font-face` rule
 * existed anywhere, and `document.fonts` held a single family (the app's own UI
 * font). A text layer naming Oswald rendered in the fallback, and there was no
 * way to choose a family at all — so the supply was built and never wired up.
 *
 * Registration is lazy and per family. `new FontFace()` does not fetch anything
 * until `load()` is called, so this only pulls the faces a design actually
 * references; a picker previewing 22 families does not cost 71 downloads.
 */

type CatalogueFace = {
  style?: string;
  urls?: string[];
};

let catalogue: FontData[] = [];
let catalogueLoaded = false;

/** The families the editor can offer, in catalogue order. */
export const fontFamilies = (): string[] => catalogue.map((font) => font.name);

/**
 * Publish the catalogue.
 *
 * Called once, after `/fonts` answers. The registry is cleared because a layer
 * can render before that happens: the editor mounts as soon as the design is
 * open, while the catalogue arrives on its own request. An attempt made in that
 * window finds nothing and would otherwise be cached as "this family does not
 * exist" for the life of the page — a font that never loads, for no reason the
 * user could ever diagnose.
 */
export const setFontCatalogue = (fonts: FontData[]) => {
  catalogue = fonts;
  catalogueLoaded = true;
  registered.clear();
};

/**
 * The first family in a CSS font stack, unquoted.
 *
 * Layer props store whatever was there when the text was made — `Oswald`,
 * `'Nunito, sans-serif'` — and a face has to be registered under the bare name
 * for either to resolve.
 */
export const primaryFamily = (value: unknown): string => {
  const first = String(value ?? '').split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '');
};

/** `Bold` is 700 and the styles are two independent axes. */
const weightOf = (style: string | undefined) =>
  /bold/i.test(style ?? '') ? '700' : '400';
const isItalic = (style: string | undefined) => /italic/i.test(style ?? '');

/**
 * Resolve a catalogue url.
 *
 * The bundled catalogue points at `/fonts/files/…` on our own API, while an
 * instance configured with `FONT_API_KEY` gets Google's absolute urls back.
 * Both have to work, so only the relative form is rewritten.
 */
const resolveUrl = (url: string) =>
  url.startsWith('/') ? `${axios.defaults.baseURL ?? ''}${url}` : url;

const registered = new Map<string, Promise<boolean>>();

/**
 * Make a family usable, once.
 *
 * Resolves to whether the family is actually available, and never rejects: a
 * font that will not load must not stop a design from rendering, and the
 * fallback face is the correct outcome. The distinction matters — resolving
 * `true` for a family that is not in the catalogue is a lie that a caller will
 * eventually act on.
 */
export const ensureFontFamily = (family: string): Promise<boolean> => {
  const name = family.trim();
  if (!name) return Promise.resolve(false);

  const inFlight = registered.get(name);
  if (inFlight) return inFlight;

  // Not asked yet, not answerable: `false`, and deliberately not remembered.
  if (!catalogueLoaded) return Promise.resolve(false);

  const entry = catalogue.find((font) => font.name === name);
  if (!entry) {
    // Remember the miss rather than re-scanning on every render.
    const missing = Promise.resolve(false);
    registered.set(name, missing);
    return missing;
  }

  const faces = (entry.fonts as CatalogueFace[]).flatMap((face) =>
    (face.urls ?? []).map((url) =>
      new FontFace(name, `url(${JSON.stringify(resolveUrl(url))})`, {
        weight: weightOf(face.style),
        style: isItalic(face.style) ? 'italic' : 'normal',
      })
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
          return true;
        })
        .catch(() => false),
    ),
  );

  const pending = Promise.all(faces).then((results) => results.some(Boolean));
  registered.set(name, pending);
  return pending;
};
