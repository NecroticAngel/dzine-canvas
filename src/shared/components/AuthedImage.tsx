import axios from 'axios';
import type { Interpolation, Theme } from '@emotion/react';
import { useEffect, useState } from 'react';

/**
 * An image that can carry the access token.
 *
 * A plain `<img src="…">` sends no `Authorization` header — it cannot — so every
 * thumbnail behind an authenticated route answers 401 and Chrome reports it as
 * `ERR_BLOCKED_BY_ORB`: no picture, and an error name that says nothing about
 * the cause. This fetches the bytes through the app's axios, which does attach
 * the token, and hands the DOM a blob URL instead.
 *
 * Anything that is not our own API is left alone: a data URL needs no help, and
 * a third-party URL must never be sent our access token.
 */
const needsToken = (url: string) => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
  const base = String(axios.defaults.baseURL ?? '');
  if (url.startsWith('/')) return true;
  try {
    return new URL(url).origin === new URL(base, window.location.origin).origin;
  } catch {
    return false;
  }
};

export const AuthedImage = ({
  src,
  alt,
  css,
  onUnavailable,
}: {
  src?: string | null;
  alt: string;
  css?: Interpolation<Theme>;
  onUnavailable?: () => void;
}) => {
  const url = src ?? '';
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !needsToken(url)) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await axios.get(url, { responseType: 'blob', timeout: 15000 });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(response.data as Blob);
        setBlobUrl(objectUrl);
      } catch {
        // A preview that will not load is the client's problem, not the page's:
        // the caller shows its placeholder, exactly as it does for a missing file.
        if (!cancelled) onUnavailable?.();
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, onUnavailable]);

  if (!url) return null;
  if (!needsToken(url)) {
    // A data URL (a local thumbnail) or somebody else's image: use it directly.
    return <img src={url} alt={alt} css={css} />;
  }
  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} css={css} />;
};
