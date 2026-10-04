import React from 'react';
import reactDomClient from 'react-dom/client';
import './styles.css';
import axios from 'axios';
import Page from './pages/Main';
import { SessionNotice } from './shared/components/SessionNotice';
import { forgetSession, getAccessToken, requiresSignIn } from './utils/oidc';
import { notifySessionProblem } from './utils/session';

type RootApi = {
  createRoot?: typeof import('react-dom/client').createRoot;
  default?: { createRoot: typeof import('react-dom/client').createRoot };
};

const createRoot =
  (reactDomClient as RootApi).createRoot ??
  (reactDomClient as RootApi).default?.createRoot;

if (!createRoot) {
  throw new Error('react-dom/client createRoot is unavailable');
}

const configuredApiEndpoint = process.env.API_ENDPOINT || '';
const runtimeBasePath = document.documentElement.dataset.basePath || '';
axios.defaults.baseURL = configuredApiEndpoint || `${runtimeBasePath}/api`;
axios.defaults.timeout = 2500;

/**
 * Our own API, whether it is addressed relatively or absolutely.
 *
 * The API hands out absolute URLs for thumbnails and shared assets, so testing
 * for a relative URL is not enough — those requests would go out without a token
 * and come back 401. Anything on another origin (the identity provider's token
 * endpoint, a font CDN) is somebody else's, and must never see our token.
 */
const isOurApi = (url: unknown) => {
  const value = String(url ?? '');
  if (!/^https?:\/\//i.test(value)) return true;
  try {
    const base = new URL(String(axios.defaults.baseURL ?? ''), window.location.origin);
    return new URL(value).origin === base.origin;
  } catch {
    return false;
  }
};

axios.interceptors.request.use(async (config) => {
  if (isOurApi(config.url)) {
    const token = await getAccessToken().catch(() => null);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Previously every failed GET was rewritten into an empty 200. That made an
    // expired session look identical to an empty account, so the rejection is
    // left intact for the call sites to handle and real session problems are
    // reported instead.
    const url = String(error?.config?.url ?? '');
    const status = error?.response?.status;
    if (isOurApi(url)) {
      if (status === 401 && requiresSignIn()) {
        // Drop the dead token: the sign-in screen is where this person has to go
        // anyway, and it is a better answer than a "session ended" overlay over
        // an app they cannot use.
        forgetSession();
      } else {
        notifySessionProblem(status, error?.response?.data?.code);
      }
    }
    return Promise.reject(error);
  },
);

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 24, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
          {this.state.error.stack || this.state.error.message}
        </pre>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <RootErrorBoundary>
    <Page />
    <SessionNotice />
  </RootErrorBoundary>,
);
