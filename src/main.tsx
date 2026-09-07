import React from 'react';
import reactDomClient from 'react-dom/client';
import './styles.css';
import axios from 'axios';
import Page from './pages/Main';

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

axios.defaults.baseURL = process.env.API_ENDPOINT || '';
axios.defaults.timeout = 2500;
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.config?.method === 'get') {
      return { data: [], status: 200, statusText: 'OK', headers: {}, config: error.config };
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
  </RootErrorBoundary>,
);
