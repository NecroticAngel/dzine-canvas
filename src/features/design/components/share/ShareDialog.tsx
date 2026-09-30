import XIcon from '@duyank/icons/regular/X';
import axios from 'axios';
import { type FC, useCallback, useEffect, useState } from 'react';

interface ShareDialogProps {
  designId: string;
  designName: string;
  onClose: () => void;
}

type Link = { token: string; createdAt: number };

const primaryButtonCss = {
  border: 'none',
  background: '#3d8eff',
  color: '#fff',
  borderRadius: 8,
  padding: '10px 16px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: 'nowrap',
} as const;

/**
 * The link we show, built from where the app is actually running.
 *
 * The API answers with the canonical URL, and it is right in production, where
 * it serves this application itself. In development Vite serves the app on a
 * different port than the API, so a link built from the response would point at
 * the API host and render nothing. Whoever is looking at the page knows the
 * address better than the server does.
 */
const displayUrl = (token: string) => {
  const { origin, pathname } = window.location;
  const base = `${origin}${pathname}`.replace(/\/index\.html$/, '/');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}share=${encodeURIComponent(token)}`;
};

export const ShareDialog: FC<ShareDialogProps> = ({
  designId,
  designName,
  onClose,
}) => {
  const [link, setLink] = useState<Link | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'revoked'>(
    'loading',
  );
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void axios
      .post<Link>(`/designs/${encodeURIComponent(designId)}/share`)
      .then((response) => {
        if (cancelled) return;
        setLink(response.data);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [designId]);

  // Reset the confirmation when the link changes underneath it.
  useEffect(() => {
    setCopied(false);
    setCopyFailed(false);
  }, [link?.token]);

  const copy = useCallback(() => {
    if (!link) return;
    const url = displayUrl(link.token);
    // `navigator.clipboard` is unavailable on insecure origins, which includes a
    // LAN address a colleague might be testing on. There is no blocking prompt
    // as a fallback: the field is on screen and selectable, so failing to copy
    // is a message, not a reason to freeze the page.
    if (!navigator.clipboard?.writeText) {
      setCopyFailed(true);
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => setCopyFailed(true));
  }, [link]);

  const revoke = useCallback(() => {
    if (!link) return;
    setState('loading');
    void axios
      .delete(`/designs/${encodeURIComponent(designId)}/share`)
      .then(() => {
        setLink(null);
        setState('revoked');
      })
      .catch(() => setState('error'));
  }, [designId, link]);

  const url = link ? displayUrl(link.token) : '';

  return (
    <div
      role="presentation"
      css={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(8, 8, 16, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Share design"
        css={{
          width: '100%',
          maxWidth: 460,
          background: '#2a2a3d',
          border: '1px solid #3a3a4c',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 18px 40px rgba(0,0,0,.45)',
          color: '#fff',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 6,
          }}
        >
          <div css={{ fontWeight: 700, fontSize: 16, flexGrow: 1 }}>
            Share “{designName}”
          </div>
          <div
            css={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              cursor: 'pointer',
              borderRadius: 6,
              ':hover': { background: 'rgba(255,255,255,.08)' },
            }}
            onClick={onClose}
          >
            <XIcon />
          </div>
        </div>

        <p css={{ margin: '0 0 14px', color: '#9aa0b5', fontSize: 13 }}>
          Anyone with this link can view the design. They cannot change it, and
          they do not need an account.
        </p>

        {state === 'loading' && (
          <p css={{ color: '#9aa0b5', fontSize: 13 }}>Preparing the link…</p>
        )}

        {state === 'error' && (
          <p css={{ color: '#ff8f8f', fontSize: 13, margin: 0 }}>
            Could not create the link. Save the design and try again.
          </p>
        )}

        {state === 'revoked' && (
          <>
            <p css={{ color: '#9aa0b5', fontSize: 13, margin: '0 0 14px' }}>
              The link no longer works. Anyone who had it will see an error
              rather than the design.
            </p>
            <button
              type="button"
              css={primaryButtonCss}
              onClick={() => {
                setState('loading');
                void axios
                  .post<Link>(`/designs/${encodeURIComponent(designId)}/share`)
                  .then((response) => {
                    setLink(response.data);
                    setState('ready');
                  })
                  .catch(() => setState('error'));
              }}
            >
              Create a new link
            </button>
          </>
        )}

        {state === 'ready' && link && (
          <>
            <div css={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                aria-label="Share link"
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                css={{
                  flexGrow: 1,
                  minWidth: 0,
                  border: '1px solid #4a4a60',
                  background: '#1e1e2d',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button type="button" css={primaryButtonCss} onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {copyFailed && (
              <p css={{ color: '#ff8f8f', fontSize: 12, margin: '8px 0 0' }}>
                Could not copy automatically — select the field and copy it by
                hand.
              </p>
            )}
            <div
              css={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
              }}
            >
              <span css={{ color: '#9aa0b5', fontSize: 12, flexGrow: 1 }}>
                Created {new Date(link.createdAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                title="Make this link stop working"
                css={{
                  border: '1px solid #4a4a60',
                  background: 'transparent',
                  color: '#c8cce0',
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  ':hover': { color: '#ff8f8f', borderColor: '#ff8f8f' },
                }}
                onClick={revoke}
              >
                Revoke
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
