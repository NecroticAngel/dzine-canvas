import { useCallback, useEffect, useState } from 'react';
import {
  apiError,
  listAdminTemplates,
  listDesigns,
  listTenants,
  type AdminTemplate,
  type DesignSummary,
  type TenantSummary,
} from '../api';
import { requiresSignIn, signOut } from '../../../utils/oidc';
import { CompaniesPanel } from '../components/CompaniesPanel';
import { TemplatesPanel } from '../components/TemplatesPanel';

type Tab = 'templates' | 'companies';

/**
 * Admin screen: the templates in the API and the companies they can be shared
 * with. Everything here is a thin layer over endpoints that already existed —
 * `GET /admin/templates`, `POST /templates`, `POST /admin/template-grants` — so
 * there is no admin-only server state to keep in step.
 */
export const AdminPage = ({ onExit }: { onExit: () => void }) => {
  const [tab, setTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextTemplates, nextTenants, nextDesigns] = await Promise.all([
        listAdminTemplates(),
        listTenants(),
        listDesigns(),
      ]);
      setTemplates(nextTemplates);
      setTenants(nextTenants);
      setDesigns(nextDesigns);
    } catch (problem) {
      setError(apiError(problem, 'Could not load the admin data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      css={{
        minHeight: '100vh',
        background: 'var(--app-workspace)',
        color: 'var(--app-text)',
      }}
    >
      <header
        css={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 28px',
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-panel)',
        }}
      >
        <strong css={{ fontSize: 16, color: 'var(--app-text-strong)' }}>Admin</strong>
        <nav css={{ display: 'flex', gap: 6 }}>
          {(['templates', 'companies'] as Tab[]).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              css={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: tab === name ? 'var(--app-surface-2)' : 'transparent',
                color: tab === name ? 'var(--app-text-strong)' : 'var(--app-text)',
              }}
            >
              {name === 'templates' ? 'Templates' : 'Companies'}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onExit}
          css={{
            marginLeft: 'auto',
            border: '1px solid var(--app-border)',
            background: 'transparent',
            color: 'var(--app-text)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Back to designs
        </button>
        {requiresSignIn() && (
          <button
            type="button"
            onClick={() => void signOut()}
            css={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        )}
      </header>

      <main css={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 64px' }}>
        {loading ? (
          <p css={{ color: 'var(--app-text-muted)' }}>Loading…</p>
        ) : error ? (
          <div
            css={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              borderRadius: 12,
              border: '1px solid var(--app-border)',
              background: 'var(--app-panel)',
            }}
          >
            <span css={{ color: '#ff8f8f' }}>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              css={{
                marginLeft: 'auto',
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text-strong)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        ) : tab === 'templates' ? (
          <TemplatesPanel
            templates={templates}
            tenants={tenants}
            designs={designs}
            onChanged={load}
          />
        ) : (
          <CompaniesPanel tenants={tenants} onCreated={load} />
        )}
      </main>
    </div>
  );
};
