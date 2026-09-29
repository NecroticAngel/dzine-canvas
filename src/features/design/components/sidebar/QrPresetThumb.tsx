import { type FC, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { colorToHex } from '../../../../utils/color';
import type { QrCodeItem } from '../../config/qrCode';

/**
 * A neutral demo icon for new QR codes.
 *
 * An inline SVG rather than a bundled asset, and drawn in the code's own dark
 * colour so it stays legible whatever palette a preset uses — a fixed black
 * would vanish on a dark QR. The QR toolbar can replace or clear it.
 */
export const cogIcon = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
      '</svg>',
  )}`;

/**
 * What a preset's own QR layer will look like once inserted.
 *
 * Read back out of the preset rather than duplicated as constants, so the
 * thumbnail cannot disagree with the layer. The colours have to go through
 * `colorToHex` because the presets store them as `rgb()`, which is the form
 * the colour inputs and the layer renderer want — but `qrcode` throws on it.
 */
const readPresetQr = (item: QrCodeItem) => {
  for (const raw of Object.values(item.elements[0].layers)) {
    const layer = raw as
      | { type?: { resolvedName?: string }; props?: Record<string, unknown> }
      | undefined;
    if (layer?.type?.resolvedName !== 'QrCodeLayer') continue;
    const props = layer.props ?? {};
    return {
      payload: String(props.text ?? '').trim() || ' ',
      dark: colorToHex(props.textColor, '#1e1e2d'),
      light: colorToHex(props.bgColor, '#ffffff'),
    };
  }
  return { payload: ' ', dark: '#1e1e2d', light: '#ffffff' };
};

/**
 * Cache of generated preview codes, keyed by content and colours.
 *
 * Keyed on the content rather than the preset index, so presets that agree on
 * all of these genuinely share one code, and so reopening the panel reuses what
 * was drawn last time instead of re-encoding three PNGs.
 */
const previewCache = new Map<string, Promise<string>>();

const previewQr = (key: string, payload: string, dark: string, light: string) => {
  const cached = previewCache.get(key);
  if (cached) return cached;
  const generated = QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    // 128px is comfortably above the ~90px the tile renders at, so the
    // thumbnail is crisp on a 2x display without being wasteful.
    width: 128,
    color: { dark, light },
  }).catch(() => {
    // The only realistic cause is a colour this library will not parse, which
    // would otherwise show as a mysteriously blank tile.
    console.warn('[qr] could not render preset preview');
    return '';
  });
  previewCache.set(key, generated);
  return generated;
};

/**
 * A preset's panel thumbnail, drawn rather than loaded from a PNG.
 *
 * The three shipped PNGs showed a logo and branding that the panel strips out
 * before inserting, so the thumbnail advertised a preset that did not exist.
 * Rendering it here means the tile is produced by the same call the layer uses
 * and cannot drift from what you get.
 */
export const QrPresetThumb: FC<{ item: QrCodeItem }> = ({ item }) => {
  const [src, setSrc] = useState('');

  const thumb = item.thumb;
  const { payload, dark: darkColor, light } = useMemo(
    () => readPresetQr(item),
    [item],
  );
  const cacheKey = `${payload}|${darkColor}|${light}`;

  useEffect(() => {
    let cancelled = false;
    void previewQr(cacheKey, payload, darkColor, light).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, payload, darkColor, light]);

  const code = (
    <div css={{ position: 'relative', width: '100%', height: '100%' }}>
      {src ? (
        <img
          alt=""
          draggable={false}
          src={src}
          css={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : null}
      {/* Mirrors the placeholder the panel inserts, at the same 22% size. */}
      <img
        alt=""
        draggable={false}
        src={cogIcon(darkColor)}
        css={{
          position: 'absolute',
          left: '39%',
          top: '39%',
          width: '22%',
          height: '22%',
          background: light,
          borderRadius: 2,
          padding: 1,
        }}
      />
    </div>
  );

  if (!thumb.card) return code;

  const dark = thumb.card === 'dark';
  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        background: dark ? '#1e1e2d' : '#ffffff',
        border: dark ? '1px solid transparent' : '1px solid var(--app-border)',
        borderRadius: 6,
        padding: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <div
        css={{
          flexGrow: 1,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          background: '#ffffff',
          borderRadius: 3,
          padding: 2,
        }}
      >
        {code}
      </div>
      {thumb.caption ? (
        <span
          css={{
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: 0.4,
            lineHeight: 1,
            color: dark ? '#ffffff' : '#1e1e2d',
          }}
        >
          {thumb.caption}
        </span>
      ) : null}
    </div>
  );
};
