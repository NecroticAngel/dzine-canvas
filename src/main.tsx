import React from 'react';
import reactDomClient from 'react-dom/client';
import './styles.css';
import axios from 'axios';
import Page from './pages/Main';
import { SessionNotice } from './shared/components/SessionNotice';
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
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Previously every failed GET was rewritten into an empty 200. That made an
    // expired session look identical to an empty account, so the rejection is
    // left intact for the call sites to handle and real session problems are
    // reported instead.
    const url = String(error?.config?.url ?? '');
    if (!/^https?:\/\//i.test(url)) {
      // Relative means our own API. An absolute URL is somebody else's service,
      // and its 401/403 says nothing about our session.
      notifySessionProblem(error?.response?.status, error?.response?.data?.code);
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
