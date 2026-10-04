import axios from 'axios';

/**
 * Sign-in against an OpenID Connect provider (Keycloak), from the browser.
 *
 * Authorization Code + PKCE, with the app as a *public* client — there is no
 * secret here and there must never be one, because anything shipped to a
 * browser is public. PKCE is what makes that safe: the code is useless without
 * the verifier, which never leaves this tab.
 *
 * Tokens live in `sessionStorage`, not `localStorage`: they die with the tab,
 * and a token in `localStorage` outlives the session on a shared machine. The
 * API verifies the same token's signature independently (`api/identity.js`), so
 * nothing here is trusted by the server — a forged token simply fails there.
 *
 * In `dev` mode none of this runs: the API hands every request the development
 * identity, and the app shows no sign-in at all.
 */

export type AuthConfig = {
  mode: 'oidc' | 'headers' | 'dev' | string;
  issuer: string;
  clientId: string;
  scopes: string;
  allowSignup: boolean;
};

type Tokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

const TOKENS_KEY = 'necrozine-oidc-tokens';
const PKCE_KEY = 'necrozine-oidc-pkce';

/**
 * A bare client for the provider's own endpoints.
 *
 * Not the app's axios: the app attaches the access token to everything it sends
 * through the default instance, and the token endpoint is exactly where that
 * must not happen — it would send the token to the provider to get a token.
 */
const idp = axios.create();

/** Treat a token as spent slightly early, so a request in flight cannot lose. */
const EXPIRY_LEEWAY_MS = 30_000;

let config: AuthConfig | null = null;
let tokens: Tokens | null = null;
let loaded = false;

/* --- Small helpers ------------------------------------------------------- */

const base64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomUrlSafe = (bytes = 32) => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
};

const issuerBase = () => String(config?.issuer ?? '').replace(/\/+$/, '');

/** Where the provider sends the browser back to: this page, without a query. */
export const redirectUri = () => `${window.location.origin}${window.location.pathname}`;

/* --- Config and stored tokens -------------------------------------------- */

export const fetchAuthConfig = async (): Promise<AuthConfig> => {
  if (config) return config;
  try {
    const response = await axios.get<AuthConfig>('/auth/config', { timeout: 8000 });
    config = {
      mode: response.data?.mode ?? 'dev',
      issuer: response.data?.issuer ?? '',
      clientId: response.data?.clientId ?? '',
      scopes: response.data?.scopes ?? 'openid profile email',
      allowSignup: response.data?.allowSignup !== false,
    };
  } catch {
    // The API is unreachable or unhappy. Behaving as "no sign-in configured"
    // keeps the app usable in development, and the session notice covers the
    // real failures.
    config = { mode: 'dev', issuer: '', clientId: '', scopes: '', allowSignup: false };
  }
  return config;
};

export const authConfigReady = () => config;

/** True when this deployment signs people in itself. */
export const requiresSignIn = () =>
  Boolean(config && config.mode === 'oidc' && config.issuer && config.clientId);

const readStored = (): Tokens | null => {
  try {
    const raw = sessionStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Tokens;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStored = (next: Tokens | null) => {
  tokens = next;
  try {
    if (next) sessionStorage.setItem(TOKENS_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(TOKENS_KEY);
  } catch {
    // A full or blocked storage must not break the session in this tab.
  }
  for (const listener of listeners) listener();
};

const listeners = new Set<() => void>();

/**
 * Be told when the session appears or goes.
 *
 * Without this the app computes "signed in?" once and never revisits it, so a
 * token dropped by a 401 left a signed-out person looking at an app whose every
 * request failed.
 */
export const subscribeToSession = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const currentTokens = () => {
  if (!loaded) {
    tokens = readStored();
    loaded = true;
  }
  return tokens;
};

export const hasSession = () => Boolean(currentTokens()?.accessToken);

/* --- Signing in ---------------------------------------------------------- */

/**
 * Send the browser to the provider. `mode` only changes the hint we can give:
 * registration happens on the provider's own page, which is the point — the app
 * never sees a password.
 */
export const startSignIn = async () => {
  const settings = await fetchAuthConfig();
  if (!settings.issuer || !settings.clientId) return;

  // `crypto.subtle` needs a secure context. localhost counts; a plain-http LAN
  // address does not, and a silent failure there is baffling — so say so.
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error(
      'Sign-in needs a secure context (https, or localhost). Open the app over https to sign in.',
    );
  }

  const verifier = randomUrlSafe(64);
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const state = randomUrlSafe(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

  const url = new URL(`${issuerBase()}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', settings.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
};

/**
 * Finish a sign-in if the URL carries one. Returns a message when the provider
 * sent back a failure, so the screen can show what actually went wrong instead
 * of a login form that silently does nothing.
 */
export const completeSignIn = async (): Promise<string | null> => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (error) {
    const description = params.get('error_description') ?? '';
    clearQuery();
    return `${error}${description ? `: ${description}` : ''}`;
  }
  if (!code || !state) return null;

  const settings = await fetchAuthConfig();
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? '') as {
        verifier?: string;
        state?: string;
      };
    } catch {
      return null;
    }
  })();
  sessionStorage.removeItem(PKCE_KEY);

  if (!saved?.verifier || saved.state !== state) {
    clearQuery();
    return 'That sign-in could not be completed. Please try again.';
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: settings.clientId,
      code,
      code_verifier: saved.verifier,
      redirect_uri: redirectUri(),
    });
    const response = await idp.post(
      `${issuerBase()}/protocol/openid-connect/token`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
    );
    storeTokenResponse(response.data);
    clearQuery();
    return null;
  } catch (problem) {
    clearQuery();
    const detail =
      (problem as { response?: { data?: { error_description?: string; error?: string } } })
        ?.response?.data;
    return detail?.error_description ?? detail?.error ?? 'The provider refused the sign-in.';
  }
};

const storeTokenResponse = (data: {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}) => {
  if (!data?.access_token) return;
  writeStored({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 300) * 1000,
  });
  loaded = true;
};

/** Drop the query the provider added, so a refresh does not replay the code. */
const clearQuery = () => {
  const url = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState(null, '', url);
};

/* --- Keeping it alive ---------------------------------------------------- */

/** A usable access token, refreshed if it is about to expire. */
export const getAccessToken = async (): Promise<string | null> => {
  const current = currentTokens();
  if (!current) return null;
  if (Date.now() < current.expiresAt - EXPIRY_LEEWAY_MS) return current.accessToken;

  // Deliberately no `fetchAuthConfig()` here: this runs from the request
  // interceptor, and fetching the config goes through that same interceptor —
  // which made the first config request wait on itself for ever. If the config
  // is not loaded yet there is nothing to refresh against anyway.
  if (!current.refreshToken || !config?.issuer) {
    writeStored(null);
    return null;
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: current.refreshToken,
    });
    const response = await idp.post(
      `${issuerBase()}/protocol/openid-connect/token`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
    );
    // A refresh may or may not return a new refresh token; keep the old one when
    // it does not, or the session would end at the first refresh.
    storeTokenResponse({ refresh_token: current.refreshToken, ...response.data });
    return currentTokens()?.accessToken ?? null;
  } catch {
    writeStored(null);
    return null;
  }
};

/** Forget this tab's session, without involving the provider. */
export const forgetSession = () => {
  writeStored(null);
  loaded = true;
};

/** Forget this tab's session and, when the provider supports it, end it there. */
export const signOut = async (everywhere = false) => {
  const current = currentTokens();
  const settings = await fetchAuthConfig();
  writeStored(null);
  if (!everywhere || !settings.issuer) {
    window.location.reload();
    return;
  }
  const url = new URL(`${issuerBase()}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('post_logout_redirect_uri', redirectUri());
  if (current?.idToken) url.searchParams.set('id_token_hint', current.idToken);
  window.location.assign(url.toString());
};
