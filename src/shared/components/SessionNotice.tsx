import { useEffect, useState } from 'react';
import {
  subscribeToSession,
  type SessionProblem,
} from '../../utils/session';

/**
 * Blocking notice shown when the API refuses us.
 *
 * Deliberately covers the app rather than sitting in a corner: with an empty
 * list and no explanation, "signed out" looks exactly like "you have no designs
 * yet", and people assume their work is gone.
 */
export const SessionNotice = () => {
  const [problem, setProblem] = useState<SessionProblem>(null);

  useEffect(() => subscribeToSession(setProblem), []);

  if (!problem) return null;
  const signedOut = problem.status === 401;

  return (
    <div
      css={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(9, 9, 14, 0.72)',
      }}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        css={{
          width: '100%',
          maxWidth: 420,
          padding: 24,
          borderRadius: 14,
          border: '1px solid var(--app-border)',
          background: 'var(--app-panel)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
        }}
      >
        <h2
          css={{
            margin: 0,
            fontSize: 17,
            fontWeight: 800,
            color: 'var(--app-text-strong)',
          }}
        >
          {signedOut ? 'Your session has ended' : 'No workspace for this account'}
        </h2>
        <p
          css={{
            margin: '10px 0 0',
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--app-text)',
          }}
        >
          {signedOut
            ? 'Sign in again to carry on. Your designs live on the server, so nothing has been lost.'
            : 'This account has not been invited to a workspace yet. Ask whoever manages your access to send an invite.'}
        </p>
        <div css={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {signedOut && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              css={{
                border: 'none',
                borderRadius: 8,
                padding: '9px 14px',
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                background: '#3d8eff',
                cursor: 'pointer',
                ':hover': { background: '#2f7ae5' },
              }}
            >
              Sign in again
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            css={{
              border: '1px solid var(--app-border)',
              borderRadius: 8,
              padding: '9px 14px',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--app-text)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};
