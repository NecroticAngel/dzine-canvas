import { useState } from 'react';
import { authConfigReady, startSignIn } from '../../utils/oidc';

/**
 * The door.
 *
 * There is no password field here on purpose: credentials are only ever entered
 * on the provider's own page (Keycloak), which is what makes this app unable to
 * leak one. "Create an account" goes to the same place — the provider decides
 * whether it offers registration, and the API tells us whether this deployment
 * wants people who were never invited.
 */
export const SignInScreen = ({ error }: { error?: string | null }) => {
  const config = authConfigReady();
  const [busy, setBusy] = useState<'signin' | 'signup' | null>(null);
  const [problem, setProblem] = useState<string | null>(error ?? null);

  const go = async (which: 'signin' | 'signup') => {
    setBusy(which);
    setProblem(null);
    try {
      await startSignIn();
    } catch (issue) {
      setProblem(
        issue instanceof Error ? issue.message : 'Could not reach the sign-in service.',
      );
      setBusy(null);
    }
  };

  const provider = (() => {
    try {
      return new URL(String(config?.issuer ?? '')).host;
    } catch {
      return null;
    }
  })();

  return (
    <div
      css={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: `
          radial-gradient(ellipse 80% 60% at 50% -10%, rgba(208, 67, 10, 0.16), transparent 60%),
          var(--app-workspace)
        `,
        color: 'var(--app-text)',
      }}
    >
      <div
        css={{
          width: '100%',
          maxWidth: 420,
          padding: 28,
          borderRadius: 16,
          border: '1px solid var(--app-border)',
          background: 'var(--app-panel)',
          boxShadow: 'var(--app-canvas-shadow)',
        }}
      >
        <h1
          css={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.01em',
            color: 'var(--app-text-strong)',
          }}
        >
          D-Zine Canvas
        </h1>
        <p css={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55 }}>
          Sign in to open your designs, or create an account to start one.
        </p>

        <div css={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go('signin')}
            css={{
              border: 'none',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 15,
              fontWeight: 800,
              color: '#fff',
              background: 'var(--app-brand-gradient)',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy && busy !== 'signin' ? 0.6 : 1,
            }}
          >
            {busy === 'signin' ? 'Taking you to sign in…' : 'Sign in'}
          </button>

          {config?.allowSignup && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void go('signup')}
              css={{
                border: '1px solid var(--app-border)',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--app-text-strong)',
                background: 'transparent',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && busy !== 'signup' ? 0.6 : 1,
                ':hover': { borderColor: 'var(--app-brand-magenta)' },
              }}
            >
              Create an account
            </button>
          )}
        </div>

        {problem && (
          <p
            role="alert"
            css={{
              margin: '16px 0 0',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#ff8f8f',
            }}
          >
            {problem}
          </p>
        )}

        {provider && (
          <p
            css={{
              margin: '18px 0 0',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--app-text-muted)',
            }}
          >
            You will be taken to <strong>{provider}</strong> to sign in, and asked
            for a registration form there if you do not have an account yet. Your
            password is never seen by this app.
          </p>
        )}
      </div>
    </div>
  );
};
