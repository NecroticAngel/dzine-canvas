import axios from 'axios';

/**
 * Session state for the app shell.
 *
 * Two jobs: report who the caller is (`GET /me`), and surface the case where the
 * API refuses us. The axios interceptor used to hide every failed GET by
 * resolving it with an empty payload, which meant a rejected login was
 * indistinguishable from an empty account — the library just looked empty.
 */

export type Session = {
  member: { id: string; email: string | null; name: string | null; role: string };
  tenant: { id: string; name: string };
  isAdmin: boolean;
  authMode: string;
};

/** A 401 means sign in again; a 403 means this account has no workspace. */
export type SessionProblem = { status: number } | null;

let problem: SessionProblem = null;
const listeners = new Set<(problem: SessionProblem) => void>();

const publish = (next: SessionProblem) => {
  if (problem?.status === next?.status) return;
  problem = next;
  for (const listener of listeners) listener(next);
};

export const notifySessionProblem = (status?: number, code?: string) => {
  // Only a genuine session problem justifies blocking the app. A plain 403 (no
  // permission for this action) must not look like being signed out, and a
  // third-party 403 — Google Fonts answers without a key — is not our business
  // at all, which is why the caller also checks the request went to our API.
  const signedOut = status === 401 || code === 'unauthenticated';
  const noWorkspace = code === 'no-workspace';
  if (!signedOut && !noWorkspace) return;
  publish({ status: signedOut ? 401 : 403 });
};

export const clearSessionProblem = () => publish(null);

export const getSessionProblem = () => problem;

export const subscribeToSession = (
  listener: (problem: SessionProblem) => void,
) => {
  listeners.add(listener);
  listener(problem);
  return () => {
    listeners.delete(listener);
  };
};

/** Who the API thinks we are, or null when it would not say. */
export const fetchSession = async (): Promise<Session | null> => {
  try {
    const response = await axios.get<Session>('/me');
    clearSessionProblem();
    return response.data;
  } catch {
    // 401/403 already reached the interceptor; anything else just means we have
    // no session details to show.
    return null;
  }
};
