import type { SerializedPage } from '@lidojs/design-core';
import { DesignFrame, Editor, PageControl } from '@lidojs/design-editor';
import axios from 'axios';
import { type FC, useEffect, useState } from 'react';
import { useFontCatalogue } from '../../../shared/hooks/useFontCatalogue';

type SharedDesign = {
  name: string;
  updatedAt: string;
  sharedAt: number;
  pages: SerializedPage[];
};

type LoadState = 'loading' | 'ready' | 'unavailable' | 'failed';

/**
 * The read-only view behind a share link.
 *
 * Renders the real editor with `readOnly`, so what a recipient sees is the
 * design rather than a re-implementation of it — the alternative is a second
 * renderer that would drift from the first one the moment either changed.
 *
 * `unavailable` covers a revoked link, a deleted design and a token that never
 * existed, and the API answers all three identically on purpose: telling them
 * apart would let someone with a guess confirm it had once been valid. The copy
 * here says so rather than inventing a more specific reason.
 */
export const SharedPage: FC<{ token: string }> = ({ token }) => {
  const [state, setState] = useState<LoadState>('loading');
  const [shared, setShared] = useState<SharedDesign | null>(null);
  const fonts = useFontCatalogue();

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void axios
      .get<SharedDesign>(`/shared/${encodeURIComponent(token)}`)
      .then((response) => {
        if (cancelled) return;
        setShared(response.data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        setState(status === 404 ? 'unavailable' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state !== 'ready' || !shared) {
    return (
      <div
        css={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--app-workspace)',
          color: 'var(--app-text)',
          padding: 24,
        }}
      >
        <div css={{ maxWidth: 420, textAlign: 'center' }}>
          <div
            css={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--app-text-strong)',
              marginBottom: 8,
            }}
          >
            {state === 'loading'
              ? 'Opening the design…'
              : state === 'unavailable'
                ? 'This link is not available'
                : 'Something went wrong'}
          </div>
          {state === 'unavailable' && (
            <p css={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              The link may have been revoked, or the design may have been
              deleted. Ask whoever sent it for a new one.
            </p>
          )}
          {state === 'failed' && (
            <p css={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              The design could not be loaded. Check your connection and try
              again.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Wait for the catalogue before mounting: the editor registers faces on the
  // first render, and a family that is not in the catalogue yet would be
  // remembered as missing for the life of the page.
  if (!fonts.length) {
    return (
      <div
        css={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--app-workspace)',
          color: 'var(--app-text)',
        }}
      >
        Opening the design…
      </div>
    );
  }

  return (
    <Editor readOnly initialPages={shared.pages} initialName={shared.name}>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          background: 'var(--app-workspace)',
          color: 'var(--app-text)',
        }}
      >
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 56,
            flexShrink: 0,
            padding: '0 16px',
            borderBottom: '1px solid var(--app-border-strong)',
            background: 'var(--app-panel)',
          }}
        >
          <span
            css={{
              fontWeight: 700,
              color: 'var(--app-text-strong)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shared.name}
          </span>
          <span
            css={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--app-text-muted)',
              border: '1px solid var(--app-border-strong)',
              borderRadius: 999,
              padding: '3px 9px',
            }}
          >
            View only
          </span>
          <span css={{ flexGrow: 1 }} />
          <span
            css={{
              fontSize: 12,
              color: 'var(--app-text-muted)',
              '@media (max-width: 700px)': { display: 'none' },
            }}
          >
            Shared with you
          </span>
        </div>

        <div css={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
          {/*
            Not `EditorContent`: that wrapper passes the bundled sample pages as
            a fallback, which is right in the editor and wrong here — an empty
            design should stay empty rather than become somebody else's artwork.
          */}
          <DesignFrame />
        </div>

        <div
          css={{
            height: 50,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            borderTop: '1px solid var(--app-border-strong)',
            background: 'var(--app-panel)',
          }}
        >
          <PageControl />
        </div>
      </div>
    </Editor>
  );
};
