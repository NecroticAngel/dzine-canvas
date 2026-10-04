'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFontCatalogue } from '../../../shared/hooks/useFontCatalogue';
import { SignInScreen } from '../../../shared/components/SignInScreen';
import {
  completeSignIn,
  fetchAuthConfig,
  hasSession,
  requiresSignIn,
  subscribeToSession,
} from '../../../utils/oidc';
import { AdminPage } from '../../admin';
import { DzineCanvasEditor } from '../components';
import { SharedPage } from './SharedPage';
import { WelcomePage } from './WelcomePage';

export const DesignPage = () => {
  const [view, setView] = useState<'welcome' | 'editor' | 'admin'>(() =>
    // `?admin` opens the admin screen straight away, so it can be bookmarked.
    new URLSearchParams(window.location.search).has('admin') ? 'admin' : 'welcome',
  );
  const [editorKey, setEditorKey] = useState(0);
  const googleFontList = useFontCatalogue();
  const [auth, setAuth] = useState<'checking' | 'ready' | 'required'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);

  /**
   * A share link is `?share=<token>` on the app itself, because the app has no
   * router: the whole interface is state inside this component, and a design is
   * opened by clicking rather than by URL. A query parameter is the smallest
   * thing that makes a link work, and it keeps every existing path intact.
   */
  const shareToken = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('share');
    return value?.trim() || null;
  }, []);

  /**
   * Work out whether this deployment signs people in, and finish a sign-in if
   * the provider just sent one back. In `dev` mode this resolves to "ready"
   * immediately, so local development never sees a login.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchAuthConfig();
      if (!requiresSignIn()) {
        if (!cancelled) setAuth('ready');
        return;
      }
      const problem = await completeSignIn();
      if (cancelled) return;
      setAuthError(problem);
      setAuth(hasSession() ? 'ready' : 'required');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A session that appears (sign-in finished elsewhere) or disappears (a 401
  // dropped a dead token) has to move this screen, or the app sits there signed
  // out with every request failing.
  useEffect(
    () =>
      subscribeToSession(() => {
        if (requiresSignIn()) setAuth(hasSession() ? 'ready' : 'required');
      }),
    [],
  );

  // A share link is read by someone with no account: it stays public, and it is
  // checked before the sign-in gate rather than after it.
  if (shareToken) {
    return <SharedPage token={shareToken} />;
  }

  if (auth === 'checking') {
    return (
      <div
        css={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--app-workspace)',
          color: 'var(--app-text-muted)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (auth === 'required') {
    return <SignInScreen error={authError} />;
  }

  if (view === 'admin') {
    return (
      <AdminPage
        onExit={() => {
          // Leaving admin is a real navigation, not a view flip, so the query
          // that opened it goes with it.
          window.history.replaceState(null, '', window.location.pathname);
          setView('welcome');
        }}
      />
    );
  }

  return view === 'welcome' ? (
    <WelcomePage
      onOpenDesign={() => {
        setEditorKey((key) => key + 1);
        setView('editor');
      }}
      onOpenAdmin={() => setView('admin')}
    />
  ) : (
    <DzineCanvasEditor
      key={editorKey}
      googleFontList={googleFontList}
      onBackHome={() => setView('welcome')}
    />
  );
};
