import type { FontData } from '@lidojs/design-core';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { setFontCatalogue } from '../../utils/fonts';

/**
 * One request per page, however many components ask.
 *
 * The catalogue is global and immutable for the life of the document, and two
 * callers already exist — the editor and the share view — with `DesignPage`
 * rendering one inside the other. Sharing the promise is what stops that being
 * two identical requests.
 */
let catalogue: Promise<FontData[]> | null = null;

const loadCatalogue = () => {
  if (catalogue) return catalogue;
  catalogue = axios
    .get<{ fonts?: FontData[] }>('/fonts')
    .then((response) => {
      // Never trust the shape: a missing endpoint, or a proxy answering with
      // HTML, would otherwise throw somewhere much less obvious.
      const list = Array.isArray(response.data?.fonts) ? response.data.fonts : [];
      const usable = list.filter((font) => font?.name && font.fonts?.length);
      setFontCatalogue(usable);
      return usable;
    })
    .catch(() => {
      // A design is still readable in fallback faces, so this is not worth an
      // error. Allow a retry rather than caching the failure.
      catalogue = null;
      return [];
    });
  return catalogue;
};

/**
 * Fetch the font catalogue and publish it to the loader.
 *
 * Both entry points need this — the editor, and the read-only share view — and
 * publishing is what makes a text layer's family resolvable at all. Without it
 * a design renders in fallback faces and nothing says why, so the two paths must
 * not be allowed to drift into one doing it and the other not.
 */
export const useFontCatalogue = () => {
  const [fonts, setFonts] = useState<FontData[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadCatalogue().then((list) => {
      if (!cancelled) setFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return fonts;
};
